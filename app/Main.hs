{-# LANGUAGE OverloadedStrings #-}

module Main where

import Control.Concurrent (forkFinally)
import Control.Exception (SomeException, displayException, try)
import Control.Monad (forever, void)
import qualified Data.ByteString as BS
import qualified Data.ByteString.Builder as BB
import qualified Data.ByteString.Char8 as B8
import qualified Data.ByteString.Lazy as BL
import qualified Data.CaseInsensitive as CI
import Data.Char (isSpace)
import Data.Int (Int64)
import Data.IORef (atomicModifyIORef', newIORef)
import Data.Maybe (fromMaybe)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import qualified Data.Text.Encoding.Error as TEE
import qualified Network.HTTP.Client as HC
import qualified Network.HTTP.Types as HT
import Network.HTTP.Types.URI (urlDecode)
import qualified Network.Socket as Socket
import Network.Socket (withSocketsDo)
import qualified Network.Socket.ByteString as SocketBS
import Network.Wai (defaultRequest)
import Network.Wai.Internal
  ( Request(..)
  , RequestBodyLength(..)
  , Response(..)
  , setRequestBodyChunks
  )
import System.Directory (getCurrentDirectory)
import System.Environment (lookupEnv)
import System.IO (BufferMode(LineBuffering), hPutStrLn, hSetBuffering, stderr, stdout)
import System.Timeout (timeout)

import CatalogApi (CatalogCache, catalogResponseCached, newCatalogCache)

data RawRequest = RawRequest
  { rrMethod  :: BS.ByteString
  , rrPath    :: BS.ByteString
  , rrQuery   :: BS.ByteString
  , rrHeaders :: HT.RequestHeaders
  , rrBody    :: BL.ByteString
  , rrRemote  :: Socket.SockAddr
  }

main :: IO ()
main = withSocketsDo $ do
  hSetBuffering stdout LineBuffering
  hSetBuffering stderr LineBuffering
  result <- try runServer :: IO (Either SomeException ())
  case result of
    Right () -> pure ()
    Left e -> do
      hPutStrLn stderr ("StreamVault Haskell backend failed during initialization: " ++ displayException e)
      error (displayException e)

runServer :: IO ()
runServer = do
  portText <- lookupEnv "PORT"
  nodeBase <- lookupEnv "STREAMVAULT_NODE"
  root <- maybe getCurrentDirectory pure =<< lookupEnv "STREAMVAULT_ROOT"
  cwd <- getCurrentDirectory
  catalogCache <- newCatalogCache
  manager <- HC.newManager HC.defaultManagerSettings
  let port = maybe 3001 readInt portText
      upstream = stripTrailingSlash (fromMaybe "http://127.0.0.1:3000" nodeBase)
  startupLog port upstream root cwd
  runRawServer port (handleClient root catalogCache manager upstream)

startupLog :: Int -> String -> FilePath -> FilePath -> IO ()
startupLog port upstream root cwd = do
  putStrLn "StreamVault Haskell backend starting"
  putStrLn ("PORT=" ++ show port)
  putStrLn ("STREAMVAULT_NODE=" ++ upstream)
  putStrLn ("STREAMVAULT_ROOT=" ++ root)
  putStrLn ("workingDirectory=" ++ cwd)
  putStrLn "serverMode=blocking-raw-socket"
  putStrLn "healthRoutes=/__haskell-health,/api/health"
  putStrLn "nativeRoutesEnabled=/api/downloads,/api/movies,/api/series,/api/section/:key"
  putStrLn "proxiedRoutesEnabled=all unsupported/risky routes -> Node"
  putStrLn "warpDiagnostic=minimal Warp helper binds but does not dispatch requests on this Windows GHC runtime"
  putStrLn ("listening=http://127.0.0.1:" ++ show port)

runRawServer :: Int -> (Socket.Socket -> Socket.SockAddr -> IO ()) -> IO ()
runRawServer port handler = do
  addr:_ <- Socket.getAddrInfo
    (Just Socket.defaultHints { Socket.addrFlags = [Socket.AI_PASSIVE], Socket.addrSocketType = Socket.Stream })
    (Just "127.0.0.1")
    (Just (show port))
  sock <- Socket.socket (Socket.addrFamily addr) Socket.Stream Socket.defaultProtocol
  Socket.setSocketOption sock Socket.ReuseAddr 1
  Socket.bind sock (Socket.addrAddress addr)
  Socket.listen sock 128
  forever $ do
    (conn, remote) <- Socket.accept sock
    void $ forkFinally (handler conn remote) (\_ -> Socket.close conn)

handleClient :: FilePath -> CatalogCache -> HC.Manager -> String -> Socket.Socket -> Socket.SockAddr -> IO ()
handleClient root catalogCache manager upstream conn remote = do
  parsed <- timeout 10000000 (readRawRequest conn remote)
  case parsed of
    Nothing ->
      sendJson conn HT.status408 "{\"error\":\"REQUEST_TIMEOUT\",\"message\":\"Timed out reading request headers\"}"
    Just (Left msg) ->
      sendJson conn HT.status400 (jsonErrorStrict "BAD_REQUEST" msg)
    Just (Right rawReq)
      | rrPath rawReq == "/__haskell-health" ->
          sendJson conn HT.status200 "{\"ok\":true,\"runtime\":\"haskell-gateway\",\"server\":\"blocking-raw-socket\"}"
      | rrPath rawReq == "/api/health" ->
          sendJson conn HT.status200 "{\"ok\":true,\"runtime\":\"haskell-gateway\",\"shadow\":true,\"server\":\"blocking-raw-socket\"}"
      | otherwise -> do
          waiReq <- toWaiRequest rawReq
          nativeResult <- try (catalogResponseCached root catalogCache waiReq) :: IO (Either SomeException (Maybe Response))
          case nativeResult of
            Right (Just native) ->
              case responseToSimple native of
                Just (status, headers, body) -> sendSimple conn status headers body
                Nothing -> proxyToNode manager upstream rawReq conn
            Right Nothing ->
              proxyToNode manager upstream rawReq conn
            Left e -> do
              hPutStrLn stderr ("native route failed, proxying to Node: " ++ displayException e)
              proxyToNode manager upstream rawReq conn

readRawRequest :: Socket.Socket -> Socket.SockAddr -> IO (Either String RawRequest)
readRawRequest conn remote = do
  headerBytes <- recvUntilHeaders BS.empty
  case headerBytes of
    Nothing -> pure (Left "request headers exceeded 65536 bytes or connection closed")
    Just raw -> do
      let (headPart, bodyStart0) = splitHeaderBody raw
      case parseRequestHead headPart of
        Left e -> pure (Left e)
        Right (method, target, headers) -> do
          let contentLength = fromMaybe 0 (lookupHeaderInt "Content-Length" headers)
          if contentLength > 2 * 1024 * 1024
            then pure (Left "request body exceeds shadow gateway limit")
            else do
              body <- readRemainingBody conn contentLength bodyStart0
              let (rawPath, rawQuery) = splitTarget target
              pure $ Right RawRequest
                { rrMethod = method
                , rrPath = if BS.null rawPath then "/" else rawPath
                , rrQuery = rawQuery
                , rrHeaders = headers
                , rrBody = BL.fromStrict body
                , rrRemote = remote
                }
  where
    recvUntilHeaders acc
      | BS.length acc > 65536 = pure Nothing
      | "\r\n\r\n" `BS.isInfixOf` acc = pure (Just acc)
      | otherwise = do
          chunk <- SocketBS.recv conn 8192
          if BS.null chunk then pure Nothing else recvUntilHeaders (acc <> chunk)

splitHeaderBody :: BS.ByteString -> (BS.ByteString, BS.ByteString)
splitHeaderBody raw =
  let (headPart, rest) = B8.breakSubstring "\r\n\r\n" raw
  in (headPart, BS.drop 4 rest)

parseRequestHead :: BS.ByteString -> Either String (BS.ByteString, BS.ByteString, HT.RequestHeaders)
parseRequestHead bytes =
  case map stripCR (B8.lines bytes) of
    [] -> Left "empty request"
    requestLine:headerLines ->
      case B8.words requestLine of
        method:target:_ ->
          Right (method, target, mapMaybeHeader parseHeader headerLines)
        _ -> Left "invalid request line"

parseHeader :: BS.ByteString -> Maybe HT.Header
parseHeader line =
  let (name, value0) = B8.break (== ':') line
  in if BS.null name || BS.null value0
       then Nothing
       else Just (CI.mk name, B8.dropWhile isSpace (BS.drop 1 value0))

mapMaybeHeader :: (a -> Maybe b) -> [a] -> [b]
mapMaybeHeader f = foldr step []
  where
    step x acc = maybe acc (:acc) (f x)

stripCR :: BS.ByteString -> BS.ByteString
stripCR bs =
  if not (BS.null bs) && BS.last bs == 13 then BS.init bs else bs

readRemainingBody :: Socket.Socket -> Int -> BS.ByteString -> IO BS.ByteString
readRemainingBody conn contentLength initial =
  go initial
  where
    go acc
      | BS.length acc >= contentLength = pure (BS.take contentLength acc)
      | otherwise = do
          chunk <- SocketBS.recv conn (contentLength - BS.length acc)
          if BS.null chunk then pure acc else go (acc <> chunk)

splitTarget :: BS.ByteString -> (BS.ByteString, BS.ByteString)
splitTarget target =
  let (pathPart, queryPart) = B8.break (== '?') target
  in (pathPart, queryPart)

lookupHeader :: BS.ByteString -> HT.RequestHeaders -> Maybe BS.ByteString
lookupHeader name headers = lookup (CI.mk name) headers

lookupHeaderInt :: BS.ByteString -> HT.RequestHeaders -> Maybe Int
lookupHeaderInt name headers = do
  raw <- lookupHeader name headers
  case reads (B8.unpack raw) of
    [(n, "")] -> Just n
    _ -> Nothing

toWaiRequest :: RawRequest -> IO Request
toWaiRequest rawReq = do
  bodyRef <- newIORef (BL.toStrict (rrBody rawReq))
  let nextBodyChunk = atomicModifyIORef' bodyRef (\chunk -> (BS.empty, chunk))
      headers = rrHeaders rawReq
  pure $ setRequestBodyChunks nextBodyChunk defaultRequest
    { requestMethod = rrMethod rawReq
    , httpVersion = HT.http11
    , rawPathInfo = rrPath rawReq
    , rawQueryString = rrQuery rawReq
    , requestHeaders = headers
    , isSecure = False
    , remoteHost = rrRemote rawReq
    , pathInfo = decodePathInfo (rrPath rawReq)
    , queryString = HT.parseQuery (rrQuery rawReq)
    , requestBodyLength = KnownLength (fromIntegral (BL.length (rrBody rawReq)))
    , requestHeaderHost = lookupHeader "Host" headers
    , requestHeaderRange = lookupHeader "Range" headers
    , requestHeaderReferer = lookupHeader "Referer" headers
    , requestHeaderUserAgent = lookupHeader "User-Agent" headers
    }

decodePathInfo :: BS.ByteString -> [T.Text]
decodePathInfo rawPath =
  [ TE.decodeUtf8With TEE.lenientDecode (urlDecode False part)
  | part <- B8.split '/' rawPath
  , not (BS.null part)
  ]

responseToSimple :: Response -> Maybe (HT.Status, HT.ResponseHeaders, BL.ByteString)
responseToSimple (ResponseBuilder status headers builder) =
  Just (status, headers, BB.toLazyByteString builder)
responseToSimple (ResponseRaw _ fallback) =
  responseToSimple fallback
responseToSimple _ =
  Nothing

proxyToNode :: HC.Manager -> String -> RawRequest -> Socket.Socket -> IO ()
proxyToNode manager upstream rawReq conn = do
  let targetUrl = upstream ++ B8.unpack (rrPath rawReq <> rrQuery rawReq)
  parsed <- try (HC.parseRequest targetUrl) :: IO (Either SomeException HC.Request)
  case parsed of
    Left e ->
      sendJson conn HT.status500 (jsonErrorStrict "BAD_UPSTREAM_URL" (displayException e))
    Right baseReq -> do
      let outReq = baseReq
            { HC.method = rrMethod rawReq
            , HC.requestHeaders = filterRequestHeaders (rrHeaders rawReq)
            , HC.requestBody = HC.RequestBodyLBS (rrBody rawReq)
            , HC.responseTimeout = HC.responseTimeoutMicro 180000000
            }
      proxied <- try (HC.responseOpen outReq manager) :: IO (Either SomeException (HC.Response HC.BodyReader))
      case proxied of
        Left e ->
          sendJson conn HT.status502 (jsonErrorStrict "UPSTREAM_NODE_UNAVAILABLE" (displayException e))
        Right res -> do
          sendHead conn (HC.responseStatus res) (filterResponseHeaders (HC.responseHeaders res)) Nothing
          streamBody (HC.responseBody res)
          HC.responseClose res
  where
    streamBody reader = do
      chunk <- HC.brRead reader
      if BS.null chunk
        then pure ()
        else SocketBS.sendAll conn chunk >> streamBody reader

filterRequestHeaders :: HT.RequestHeaders -> HT.RequestHeaders
filterRequestHeaders =
  filter (\(name, _) -> CI.foldedCase name `notElem` ["host", "connection", "content-length"])

filterResponseHeaders :: HT.ResponseHeaders -> HT.ResponseHeaders
filterResponseHeaders =
  filter (\(name, _) -> CI.foldedCase name `notElem` hopByHopHeaders)

hopByHopHeaders :: [BS.ByteString]
hopByHopHeaders =
  [ "connection"
  , "keep-alive"
  , "proxy-authenticate"
  , "proxy-authorization"
  , "te"
  , "trailer"
  , "transfer-encoding"
  , "upgrade"
  ]

sendJson :: Socket.Socket -> HT.Status -> BS.ByteString -> IO ()
sendJson conn status body =
  sendSimple conn status [("Content-Type", "application/json")] (BL.fromStrict body)

sendSimple :: Socket.Socket -> HT.Status -> HT.ResponseHeaders -> BL.ByteString -> IO ()
sendSimple conn status headers body = do
  sendHead conn status (filterResponseHeaders headers) (Just (BL.length body))
  SocketBS.sendAll conn (BL.toStrict body)

sendHead :: Socket.Socket -> HT.Status -> HT.ResponseHeaders -> Maybe Int64 -> IO ()
sendHead conn status headers bodyLength = do
  let lengthHeader = maybe [] (\n -> [("Content-Length", B8.pack (show n))]) bodyLength
      finalHeaders = headers ++ lengthHeader ++ [("Connection", "close")]
      headBytes = B8.concat $
        [ "HTTP/1.1 "
        , B8.pack (show (HT.statusCode status))
        , " "
        , HT.statusMessage status
        , "\r\n"
        ]
        ++ concatMap renderHeader finalHeaders
        ++ ["\r\n"]
  SocketBS.sendAll conn headBytes

renderHeader :: HT.Header -> [BS.ByteString]
renderHeader (name, value) =
  [CI.original name, ": ", value, "\r\n"]

jsonErrorStrict :: String -> String -> BS.ByteString
jsonErrorStrict code msg =
  B8.pack ("{\"error\":\"" ++ esc code ++ "\",\"message\":\"" ++ esc msg ++ "\"}")

esc :: String -> String
esc = concatMap go
  where
    go '"' = "\\\""
    go '\\' = "\\\\"
    go '\n' = "\\n"
    go '\r' = "\\r"
    go '\t' = "\\t"
    go c = [c]

readInt :: String -> Int
readInt s =
  case reads s of
    [(n, "")] -> n
    _ -> 3001

stripTrailingSlash :: String -> String
stripTrailingSlash xs =
  case reverse xs of
    ('/':rest) -> reverse rest
    _ -> xs
