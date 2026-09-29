{-# LANGUAGE OverloadedStrings #-}

module Main where

import qualified Data.ByteString.Char8 as B8
import Network.HTTP.Types (status200)
import Network.Wai (rawPathInfo, responseLBS)
import Network.Wai.Handler.Warp (defaultSettings, runSettings, setBeforeMainLoop, setPort)
import System.Environment (lookupEnv)
import System.IO (BufferMode(LineBuffering), hSetBuffering, stdout)

main :: IO ()
main = do
  hSetBuffering stdout LineBuffering
  portText <- lookupEnv "PORT"
  let port = maybe 3049 readInt portText
      settings =
        setPort port
        $ setBeforeMainLoop (putStrLn ("warp health-only listening on http://127.0.0.1:" ++ show port))
        $ defaultSettings
  runSettings settings $ \req respond -> do
    putStrLn ("warp health-only request path=" ++ B8.unpack (rawPathInfo req))
    respond $ responseLBS
      status200
      [("Content-Type", "application/json")]
      "{\"ok\":true,\"runtime\":\"warp-health-only\"}"

readInt :: String -> Int
readInt s =
  case reads s of
    [(n, "")] -> n
    _ -> 3049
