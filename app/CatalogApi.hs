{-# LANGUAGE OverloadedStrings #-}

module CatalogApi
  ( CatalogState
  , CatalogCache
  , newCatalogCache
  , loadCatalogState
  , catalogResponseCached
  , catalogResponse
  ) where

import Control.Exception (SomeException, try)
import Data.Aeson
import Data.Aeson.Key (fromText)
import qualified Data.Aeson.KeyMap as KM
import qualified Data.ByteString.Lazy as BL
import Data.Char (isAlphaNum, isDigit, isSpace, toLower)
import Data.List (find, foldl', isInfixOf, isPrefixOf, nub, sortBy)
import Data.Maybe (fromMaybe, listToMaybe, mapMaybe)
import qualified Data.Text as T
import qualified Data.Text.Encoding as TE
import qualified Data.Text.Encoding.Error as TEE
import qualified Data.Vector as V
import Data.IORef (IORef, newIORef, readIORef, writeIORef)
import Network.HTTP.Types (Status, status200)
import Network.HTTP.Types.Header (ResponseHeaders)
import Network.Wai (Request, Response, pathInfo, queryString, requestMethod, responseLBS)
import System.Directory (doesDirectoryExist, doesFileExist, listDirectory)
import System.FilePath ((</>), takeBaseName, takeExtension)

import CryptoHashCompat (sha1Hex16)

data CatalogState = CatalogState
  { csRoot          :: FilePath
  , csCatalogMovies :: [Value]
  , csCatalogSeries :: [Value]
  , csLocalMovies   :: [Value]
  , csLocalSeries   :: [Value]
  , csDownloads     :: [Value]
  }

type CatalogCache = IORef (Maybe CatalogState)

data PageMode = ZeroBased | OneBased deriving (Eq)

videoExts :: [String]
videoExts = [".mp4", ".mkv", ".avi", ".mov", ".webm", ".flv", ".wmv", ".m4v", ".mpg", ".mpeg", ".3gp"]

newCatalogCache :: IO CatalogCache
newCatalogCache = newIORef Nothing

loadCatalogState :: FilePath -> IO CatalogState
loadCatalogState root = do
  catalog <- readJsonValue (root </> "catalog.json") (Object KM.empty)
  posterCache <- readJsonObject (root </> "poster-cache.json")
  downloads <- loadDownloads root
  localMovies <- buildLocalMovies root posterCache
  localSeriesItems <- buildLocalSeries root posterCache
  let catalogMovies = dedupeBy titleYearKey (arrayField "movies" catalog)
      catalogSeries = dedupeBy titleYearKey (arrayField "series" catalog)
  pure CatalogState
    { csRoot = root
    , csCatalogMovies = catalogMovies
    , csCatalogSeries = catalogSeries
    , csLocalMovies = localMovies
    , csLocalSeries = localSeriesItems
    , csDownloads = downloads
    }

catalogResponseCached :: FilePath -> CatalogCache -> Request -> IO (Maybe Response)
catalogResponseCached root cache req
  | requestMethod req == "OPTIONS" && nativeCatalogRoute req =
      pure $ Just $ responseWith status200 [("Access-Control-Allow-Origin", "*")] ""
  | requestMethod req /= "GET" || not (nativeCatalogRoute req) =
      pure Nothing
  | otherwise = do
      cached <- readIORef cache
      stateResult <- case cached of
        Just state -> pure (Right state)
        Nothing -> do
          loaded <- try (loadCatalogState root) :: IO (Either SomeException CatalogState)
          case loaded of
            Right state -> writeIORef cache (Just state) >> pure (Right state)
            Left e -> pure (Left e)
      case stateResult of
        Right state -> pure (catalogResponse state req)
        Left _ -> pure Nothing

nativeCatalogRoute :: Request -> Bool
nativeCatalogRoute req =
  pathInfo req `elem`
    [ ["api", "downloads"]
    , ["api", "movies"]
    , ["api", "series"]
    ]
    || ["api", "section"] `isPrefixOf` pathInfo req

catalogResponse :: CatalogState -> Request -> Maybe Response
catalogResponse state req
  | requestMethod req == "OPTIONS" =
      Just $ responseWith status200 [("Access-Control-Allow-Origin", "*")] ""
  | requestMethod req /= "GET" = Nothing
  | pathInfo req == ["api", "downloads"] =
      Just $ jsonResponse [("Cache-Control", "no-store"), ("X-StreamVault-Haskell", "native-downloads")]
        (downloadsResponse state req)
  | pathInfo req == ["api", "movies"] =
      Just $ jsonResponse [("X-StreamVault-Haskell", "native-movies")]
        (moviesResponse state req)
  | pathInfo req == ["api", "series"] =
      Just $ jsonResponse [("X-StreamVault-Haskell", "native-series")]
        (seriesResponse state req)
  | ["api", "section"] `isPrefixOf` pathInfo req =
      case drop 2 (pathInfo req) of
        (key:_) -> Just $ jsonResponse [("Cache-Control", "public, max-age=60"), ("X-StreamVault-Haskell", "native-section")]
          (sectionResponse state req key)
        _ -> Nothing
  | otherwise = Nothing

jsonResponse :: ResponseHeaders -> Value -> Response
jsonResponse extra body =
  responseWith status200 (("Content-Type", "application/json") : extra) (encode body)

responseWith :: Status -> ResponseHeaders -> BL.ByteString -> Response
responseWith st extra =
  responseLBS st (corsHeaders ++ extra)

corsHeaders :: ResponseHeaders
corsHeaders =
  [ ("Access-Control-Allow-Origin", "*")
  , ("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  , ("Access-Control-Allow-Headers", "Content-Type, Range")
  ]

readJsonValue :: FilePath -> Value -> IO Value
readJsonValue fp fallback = do
  exists <- doesFileExist fp
  if not exists
    then pure fallback
    else do
      raw <- try (BL.readFile fp) :: IO (Either SomeException BL.ByteString)
      case raw of
        Left _ -> pure fallback
        Right body -> pure (fromMaybe fallback (decode body))

readJsonObject :: FilePath -> IO (KM.KeyMap Value)
readJsonObject fp = do
  v <- readJsonValue fp (Object KM.empty)
  case v of
    Object o -> pure o
    _ -> pure KM.empty

arrayField :: T.Text -> Value -> [Value]
arrayField key (Object o) =
  case KM.lookup (fromText key) o of
    Just (Array xs) -> V.toList xs
    _ -> []
arrayField _ _ = []

valueText :: Value -> T.Text
valueText (String t) = t
valueText (Number n) = T.pack (show n)
valueText (Bool True) = "true"
valueText (Bool False) = "false"
valueText _ = ""

field :: T.Text -> Value -> Value
field key (Object o) = fromMaybe Null (KM.lookup (fromText key) o)
field _ _ = Null

fieldText :: T.Text -> Value -> T.Text
fieldText key = valueText . field key

firstText :: [T.Text] -> Value -> T.Text
firstText keys v = fromMaybe "" $ find (not . T.null) [fieldText k v | k <- keys]

fieldArray :: T.Text -> Value -> [Value]
fieldArray key v =
  case field key v of
    Array xs -> V.toList xs
    _ -> []

lookupObject :: T.Text -> KM.KeyMap Value -> Maybe Value
lookupObject key = KM.lookup (fromText key)

strLower :: String -> String
strLower = map toLower

textLower :: T.Text -> T.Text
textLower = T.toLower

trimText :: T.Text -> T.Text
trimText = T.dropAround isSpace

valueListText :: T.Text -> Value -> [T.Text]
valueListText key v =
  case field key v of
    Array xs -> [t | String t <- V.toList xs]
    String t | not (T.null t) -> [t]
    _ -> []

titleYearKey :: Value -> T.Text
titleYearKey item =
  textLower (firstText ["title", "name"] item) <> "|" <> fieldText "year" item

dedupeBy :: (Value -> T.Text) -> [Value] -> [Value]
dedupeBy keyOf = reverse . snd . foldl' step ([], [])
  where
    step (seen, out) item =
      let key = keyOf item
      in if key `elem` seen then (seen, out) else (key : seen, item : out)

isCartoonOrAnime :: Value -> Bool
isCartoonOrAnime item =
  let name = T.toLower (firstText ["name", "title"] item)
      genre = T.toLower (fieldText "genre" item)
      filename = T.toLower (firstText ["file", "filename"] item)
      hay = T.unpack (T.unwords [name, genre, filename])
      bad =
        [ "cartoon", "anime", "animated", "tv cartoon", "cartoon series"
        , "kids", "children", "pbs kids", "nickelodeon", "disney channel"
        , "cartoon network", "boomerang", "adult swim", "family guy", "simpsons"
        , "south park", "rick and morty", "sponge", "paw patrol", "peppa pig"
        , "anime movie", "animated movie"
        ]
  in "animation" `T.isInfixOf` genre || "anime" `T.isInfixOf` genre || any (`isInfixOf` hay) bad

listVideoFiles :: FilePath -> IO [FilePath]
listVideoFiles dir = do
  exists <- doesDirectoryExist dir
  if not exists
    then pure []
    else do
      names <- listDirectory dir
      pure [n | n <- names, strLower (takeExtension n) `elem` videoExts]

buildLocalMovies :: FilePath -> KM.KeyMap Value -> IO [Value]
buildLocalMovies root posters = do
  files <- listVideoFiles (root </> "movies")
  pure [localMovie posters idx file | (idx, file) <- zip [(0 :: Int)..] files]

localMovie :: KM.KeyMap Value -> Int -> FilePath -> Value
localMovie posters idx file =
  let name = cleanTitle file
      key = T.pack (takeBaseName file)
      info = lookupObject key posters
      infoField k = maybe Null (field k) info
  in object
    [ "id" .= idx
    , "name" .= name
    , "file" .= T.pack file
    , "poster" .= nullish (infoField "poster")
    , "tmdbId" .= nullish (infoField "tmdbId")
    , "overview" .= textOr "" (infoField "overview")
    , "year" .= textOr "" (infoField "year")
    , "rating" .= nullish (infoField "rating")
    , "type" .= String "movie"
    , "genre" .= textOr "" (infoField "genre")
    , "runtime" .= textOr "" (infoField "runtime")
    , "director" .= textOr "" (infoField "director")
    , "language" .= textOr "" (infoField "language")
    , "productionCompanies" .= arrayOrEmpty (infoField "productionCompanies")
    ]

textOr :: T.Text -> Value -> Value
textOr fallback Null = String fallback
textOr _ (String t) = String t
textOr _ v = v

arrayOrEmpty :: Value -> Value
arrayOrEmpty (Array xs) = Array xs
arrayOrEmpty _ = Array V.empty

nullish :: Value -> Value
nullish (String "") = Null
nullish v = v

buildLocalSeries :: FilePath -> KM.KeyMap Value -> IO [Value]
buildLocalSeries root posters = do
  movieFiles <- listVideoFiles (root </> "movies")
  seriesFiles <- listVideoFiles (root </> "series")
  let offset = length movieFiles
      episodes = mapMaybe (uncurry parseLocalEpisode) (zip [offset..] seriesFiles)
      grouped = groupEpisodes episodes
  pure (map (localSeries posters) grouped)

data Episode = Episode
  { epShow :: T.Text
  , epSeason :: Int
  , epNumber :: Int
  , epTitle :: T.Text
  , epStreamId :: Int
  , epFile :: FilePath
  }

parseLocalEpisode :: Int -> FilePath -> Maybe Episode
parseLocalEpisode idx file =
  let clean = cleanupEpisodeBase (T.pack (takeBaseName file))
      tokens = T.words clean
      lowerTokens = map T.toLower tokens
  in case findEpisodeToken lowerTokens of
       Just (beforeCount, seasonNum, epNum) ->
         let showName = trimText (T.unwords (take beforeCount tokens))
             rest = drop (beforeCount + 1) tokens
             title = trimText (T.unwords rest)
         in if T.null showName then Nothing else Just Episode
              { epShow = showName
              , epSeason = seasonNum
              , epNumber = epNum
              , epTitle = title
              , epStreamId = idx
              , epFile = file
              }
       Nothing -> Nothing

findEpisodeToken :: [T.Text] -> Maybe (Int, Int, Int)
findEpisodeToken = go 0
  where
    go _ [] = Nothing
    go n (x:xs) =
      case parseSxe x of
        Just (s, e) -> Just (n, s, e)
        Nothing -> go (n + 1) xs

parseSxe :: T.Text -> Maybe (Int, Int)
parseSxe token =
  let raw = T.unpack token
      (sPart, rest) = span (/= 'e') raw
  in case raw of
       ('s':_) | not (null rest) ->
         let sDigits = filter isDigit sPart
             eDigits = filter isDigit (drop 1 rest)
         in if null sDigits || null eDigits then Nothing else Just (read sDigits, read eDigits)
       _ -> Nothing

groupEpisodes :: [Episode] -> [(T.Text, [Episode])]
groupEpisodes =
  sortBy (\(a, _) (b, _) -> compare a b) . foldl' step []
  where
    step [] ep = [(epShow ep, [ep])]
    step ((showName, eps):rest) ep
      | showName == epShow ep = (showName, ep:eps) : rest
      | otherwise = (showName, eps) : step rest ep

localSeries :: KM.KeyMap Value -> (T.Text, [Episode]) -> Value
localSeries posters (showName, eps) =
  let key = "__series__" <> showName
      info = lookupObject key posters
      infoField k = maybe Null (field k) info
      seasons = seasonsObject eps
      base =
        [ "name" .= showName
        , "seasons" .= seasons
        ]
      extra = case info of
        Nothing -> []
        Just _ ->
          [ "poster" .= nullish (infoField "poster")
          , "tmdbId" .= nullish (infoField "tmdbId")
          , "overview" .= textOr "" (infoField "overview")
          , "year" .= textOr "" (infoField "year")
          , "rating" .= nullish (infoField "rating")
          , "genre" .= textOr "" (infoField "genre")
          , "language" .= textOr "" (infoField "language")
          , "productionCompanies" .= arrayOrEmpty (infoField "productionCompanies")
          ]
  in object (base ++ extra)

seasonsObject :: [Episode] -> Value
seasonsObject eps =
  Object $ KM.fromList
    [ (fromText (T.pack (show seasonNo)), Array (V.fromList (map episodeValue sorted)))
    | seasonNo <- nub (map epSeason eps)
    , let sorted = sortBy (\a b -> compare (epNumber a) (epNumber b)) [e | e <- eps, epSeason e == seasonNo]
    ]

episodeValue :: Episode -> Value
episodeValue ep =
  object
    [ "streamId" .= epStreamId ep
    , "episode" .= epNumber ep
    , "epTitle" .= if T.null (epTitle ep) then T.pack ("Episode " ++ show (epNumber ep)) else epTitle ep
    , "file" .= T.pack (epFile ep)
    ]

cleanTitle :: FilePath -> T.Text
cleanTitle file =
  let base = T.pack (takeBaseName file)
      spaced = cleanupSeparators base
      cut = cutAtAny qualityTokens spaced
      withoutBrackets = removeBracketContent cut
      withoutYear = stripTrailingYear (trimText withoutBrackets)
  in if T.length withoutYear >= 2 then withoutYear else trimText withoutBrackets

cleanupEpisodeBase :: T.Text -> T.Text
cleanupEpisodeBase =
  trimText . cutAtAny episodeCutTokens . removeBracketContent . cleanupSeparators

cleanupSeparators :: T.Text -> T.Text
cleanupSeparators =
  T.unwords . T.words . T.map repl
  where
    repl c
      | c == '.' || c == '_' = ' '
      | otherwise = c

removeBracketContent :: T.Text -> T.Text
removeBracketContent = T.pack . go 0 . T.unpack
  where
    go :: Int -> String -> String
    go _ [] = []
    go depth (c:cs)
      | c `elem` ("([{" :: String) = go (depth + 1) cs
      | c `elem` (")]}" :: String) = go (max 0 (depth - 1)) cs
      | depth > 0 = go depth cs
      | otherwise = c : go depth cs

stripTrailingYear :: T.Text -> T.Text
stripTrailingYear txt =
  case reverse (T.words txt) of
    (lastWord:rest)
      | T.length lastWord == 4 && T.all isDigit lastWord
          && lastWord >= "1900" && lastWord <= "2099" ->
          T.unwords (reverse rest)
    _ -> txt

qualityTokens :: [T.Text]
qualityTokens =
  [ "1080p", "720p", "480p", "4k", "2160p", "uhd", "bluray", "blu ray"
  , "webrip", "web dl", "hdtv", "x264", "x265", "hevc", "aac", "dts"
  , "extended", "remastered", "proper", "repack", "hdr", "dolby", "atmos"
  ]

episodeCutTokens :: [T.Text]
episodeCutTokens =
  [ "1080p", "720p", "480p", "2160p", "bluray", "brrip", "webrip"
  , "web dl", "hdtv", "x264", "x265", "hevc", "aac", "dts", "ac3"
  , "msubs", "esub", "dual", "hindi", "english", "multi", "pahe"
  ]

cutAtAny :: [T.Text] -> T.Text -> T.Text
cutAtAny needles text =
  let lowerText = T.toLower text
      positions =
        [ idx
        | needle <- needles
        , let idxs = findNeedlePositions needle lowerText
        , idx <- idxs
        ]
  in case positions of
       [] -> text
       xs -> trimText (T.take (minimum xs) text)

findNeedlePositions :: T.Text -> T.Text -> [Int]
findNeedlePositions needle text =
  go 0 text
  where
    go offset rest
      | T.null needle || T.null rest = []
      | needle `T.isPrefixOf` rest = offset : go (offset + 1) (T.drop 1 rest)
      | otherwise = go (offset + 1) (T.drop 1 rest)

loadDownloads :: FilePath -> IO [Value]
loadDownloads root = do
  let fp = root </> "data" </> "catalogs" </> "downloads-catalog.json"
  raw <- readJsonValue fp (Array V.empty)
  let items = case raw of
        Array xs -> V.toList xs
        Object o ->
          concat [fromArray (KM.lookup (fromText k) o) | k <- ["downloads", "items", "software", "apps", "files"]]
        _ -> []
      normalized = mapMaybe normalizeDownload (zip [(0 :: Int)..] items)
  pure (dedupeBy downloadDedupeKey normalized)

fromArray :: Maybe Value -> [Value]
fromArray (Just (Array xs)) = V.toList xs
fromArray _ = []

downloadDedupeKey :: Value -> T.Text
downloadDedupeKey item =
  T.toLower (firstText ["source", "url", "name"] item)

normalizeDownload :: (Int, Value) -> Maybe Value
normalizeDownload (idx, item) =
  let url = trimText $ firstText
        [ "source", "url", "href", "link", "downloadUrl", "downloadURL"
        , "download_url", "directUrl", "directURL", "fileUrl", "fileURL"
        , "path", "streamUrl", "src"
        ] item
      ext = T.toLower $ stripDot $ textFallback (firstText ["extension", "ext"] item) (softwareExt url)
      filename = textFallback (firstText ["filename", "file"] item) (lastUrlPart url)
      name = trimText $ textFallback (firstText ["name", "title", "label"] item) (softwareTitleFromUrl (textFallback filename url))
      platform = softwarePlatform item ext url
      category = softwareCategory item platform url
      ident = textFallback (fieldText "id" item) ("sw_" <> T.pack (sha1Hex16 (T.unpack (textFallback url name) ++ show idx)))
      sourceUrlOk = "http://" `T.isPrefixOf` T.toLower url || "https://" `T.isPrefixOf` T.toLower url || "ftp://" `T.isPrefixOf` T.toLower url
  in if not sourceUrlOk || T.length name < 2
       then Nothing
       else Just $ object
         [ "id" .= ident
         , "name" .= name
         , "filename" .= filename
         , "extension" .= ext
         , "category" .= category
         , "platform" .= platform
         , "type" .= textFallback (fieldText "type" item) category
         , "size" .= nullish (firstValue ["size", "bytes", "sizeBytes", "length"] item)
         , "icon" .= textFallback (firstText ["icon", "poster", "image"] item) ""
         , "source" .= url
         , "url" .= url
         ]

firstValue :: [T.Text] -> Value -> Value
firstValue keys item =
  fromMaybe Null $ find nonEmpty [field k item | k <- keys]
  where
    nonEmpty Null = False
    nonEmpty (String "") = False
    nonEmpty _ = True

textFallback :: T.Text -> T.Text -> T.Text
textFallback a b = if T.null a then b else a

stripDot :: T.Text -> T.Text
stripDot = T.dropWhile (== '.')

softwareExt :: T.Text -> T.Text
softwareExt url =
  let noQuery = T.takeWhile (/= '?') url
      part = lastUrlPart noQuery
  in T.dropWhile (== '.') $ snd (T.breakOnEnd "." part)

lastUrlPart :: T.Text -> T.Text
lastUrlPart url =
  let parts = T.splitOn "/" url
  in fromMaybe "" (listToMaybe (reverse parts))

softwareTitleFromUrl :: T.Text -> T.Text
softwareTitleFromUrl value =
  let raw = lastUrlPart value
      noExt = case T.breakOnEnd "." raw of
        ("", _) -> raw
        (a, _) -> T.dropEnd 1 a
      titled = T.unwords . T.words $ T.map (\c -> if c == '.' || c == '_' || c == '-' then ' ' else c) noExt
  in textFallback titled (textFallback raw "Untitled")

softwarePlatform :: Value -> T.Text -> T.Text -> T.Text
softwarePlatform item ext url =
  let text = T.toLower (T.unwords [fieldText "platform" item, fieldText "category" item, fieldText "type" item, firstText ["name", "title"] item, url])
  in if ext `elem` ["apk", "xapk", "apks"] || "android" `T.isInfixOf` text then "Android"
     else if ext `elem` ["exe", "msi"] || "windows" `T.isInfixOf` text then "Windows"
     else if ext `elem` ["dmg", "pkg"] || "mac" `T.isInfixOf` text then "macOS"
     else if ext `elem` ["iso", "img"] || "operating system" `T.isInfixOf` text || "/os/" `T.isInfixOf` text then "OS"
     else if ext `elem` ["nsp", "xci", "cia", "3ds", "gba", "nds", "nes", "snes", "wbfs"] || "console" `T.isInfixOf` text then "Console"
     else if ext `elem` ["zip", "rar", "7z"] then "Archive"
     else textFallback (fieldText "platform" item) "Other"

softwareCategory :: Value -> T.Text -> T.Text -> T.Text
softwareCategory item platform url =
  let text = T.toLower (T.unwords [fieldText "category" item, fieldText "type" item, firstText ["name", "title"] item, url])
  in if "game" `T.isInfixOf` text then if platform == "Console" then "Console Games" else "Games"
     else if platform == "Android" then "Android"
     else if platform == "Windows" then "Software"
     else if platform == "OS" then "OS"
     else if platform == "Archive" then "Archives"
     else textFallback (fieldText "category" item) (textFallback platform "Other")

queryText :: T.Text -> Request -> Maybe T.Text
queryText name req =
  let wanted = TE.encodeUtf8 name
  in fmap (TE.decodeUtf8With TEE.lenientDecode) (joinMaybe (lookup wanted (queryString req)))

joinMaybe :: Maybe (Maybe a) -> Maybe a
joinMaybe (Just (Just x)) = Just x
joinMaybe _ = Nothing

queryInt :: T.Text -> Int -> Request -> Int
queryInt name fallback req =
  maybe fallback (readInt fallback . T.unpack) (queryText name req)

readInt :: Int -> String -> Int
readInt fallback raw =
  case reads raw of
    [(n, "")] -> n
    _ -> fallback

pageSlice :: PageMode -> Int -> Int -> [Value] -> (Int, Int, [Value], Int)
pageSlice mode page limit items =
  let safeLimit = min 120 (max 1 limit)
      safePage = case mode of
        ZeroBased -> max 0 page
        OneBased -> max 1 page
      start = case mode of
        ZeroBased -> safePage * safeLimit
        OneBased -> (safePage - 1) * safeLimit
      total = length items
      pages = pageCount safeLimit total
  in (safePage, pages, take safeLimit (drop start items), total)

pageCount :: Int -> Int -> Int
pageCount limit total =
  max 1 (ceiling (fromIntegral total / fromIntegral limit :: Double))

downloadsResponse :: CatalogState -> Request -> Value
downloadsResponse state req =
  let q = T.toLower . trimText $ fromMaybe "" (queryText "q" req)
      terms = filter (not . T.null) (T.words q)
      filtered =
        if null terms
          then csDownloads state
          else filter (downloadMatches terms) (csDownloads state)
      limit = min 50000 (max 1 (queryInt "limit" 50000 req))
      page = max 0 (queryInt "page" 0 req)
      start = page * limit
      total = length filtered
      pages = pageCount limit total
  in object
    [ "items" .= take limit (drop start filtered)
    , "total" .= total
    , "page" .= page
    , "pages" .= pages
    ]

downloadMatches :: [T.Text] -> Value -> Bool
downloadMatches terms item =
  let text = T.toLower (T.unwords [fieldText "name" item, fieldText "filename" item, fieldText "category" item, fieldText "platform" item, fieldText "extension" item])
  in all (`T.isInfixOf` text) terms

ftpMovieRouteItems :: CatalogState -> [Value]
ftpMovieRouteItems state =
  [ object
    [ "id" .= T.pack ("ftp_" ++ show i)
    , "name" .= fieldText "title" m
    , "title" .= fieldText "title" m
    , "file" .= fieldText "filename" m
    , "poster" .= nullish (field "poster" m)
    , "backdrop" .= fallbackValue (field "backdrop" m) (field "poster" m)
    , "tmdbId" .= nullish (field "tmdbId" m)
    , "year" .= textOr "" (field "year" m)
    , "rating" .= nullish (field "rating" m)
    , "type" .= String "movie"
    , "genre" .= textOr "" (field "genre" m)
    , "category" .= textOr "" (field "category" m)
    , "streamUrl" .= fieldText "streamUrl" m
    , "isFtp" .= True
    ]
  | (i, m) <- zip [(0 :: Int)..] (csCatalogMovies state)
  , not (isCartoonOrAnime m)
  ]

fallbackValue :: Value -> Value -> Value
fallbackValue Null b = nullish b
fallbackValue (String "") b = nullish b
fallbackValue a _ = a

moviesList :: CatalogState -> [Value]
moviesList state =
  let local = csLocalMovies state
      seen = [T.toLower (firstText ["name", "title"] m) <> "|" <> fieldText "year" m | m <- local]
      ftp = filter (\m -> (T.toLower (firstText ["name", "title"] m) <> "|" <> fieldText "year" m) `notElem` seen) (ftpMovieRouteItems state)
  in local ++ ftp

moviesResponse :: CatalogState -> Request -> Value
moviesResponse state req =
  let base = moviesList state
      items = applyBrowseSearch "movies" req base
      (page, pages, pageItems, total) = pageSlice ZeroBased (queryInt "page" 0 req) (queryInt "limit" 72 req) items
  in object
    [ "movies" .= pageItems
    , "total" .= total
    , "page" .= page
    , "pages" .= pages
    ]

ftpSeriesRouteItems :: Int -> CatalogState -> [Value]
ftpSeriesRouteItems requestedLimit state =
  let raw = if requestedLimit > 0
        then take (max 0 (requestedLimit - length (csLocalSeries state))) (csCatalogSeries state)
        else csCatalogSeries state
  in [seriesRouteValue s | s <- raw, not (isCartoonOrAnime s)]

seriesRouteValue :: Value -> Value
seriesRouteValue s =
  object
    [ "name" .= fieldText "title" s
    , "title" .= fieldText "title" s
    , "poster" .= nullish (field "poster" s)
    , "backdrop" .= fallbackValue (field "backdrop" s) (field "poster" s)
    , "tmdbId" .= nullish (field "tmdbId" s)
    , "year" .= textOr "" (field "year" s)
    , "rating" .= nullish (field "rating" s)
    , "genre" .= textOr "" (field "genre" s)
    , "type" .= String "series"
    , "isFtp" .= True
    , "seasons" .= ftpSeasonsObject s
    ]

ftpSeasonsObject :: Value -> Value
ftpSeasonsObject s =
  Object $ KM.fromList
    [ (fromText (T.pack (show seasonNo)), Array (V.fromList eps))
    | seasonObj <- fieldArray "seasons" s
    , let seasonNo = seasonNumber (fieldText "season" seasonObj)
          eps = [ftpEpisodeValue ep idx | (idx, ep) <- zip [(0 :: Int)..] (fieldArray "episodes" seasonObj)]
    ]

seasonNumber :: T.Text -> Int
seasonNumber label =
  case filter (not . null) (map (filter isDigit . T.unpack) (T.words label)) of
    (x:_) -> readInt 1 x
    [] -> 1

ftpEpisodeValue :: Value -> Int -> Value
ftpEpisodeValue ep idx =
  let filename = fieldText "filename" ep
      parsed = parseEpisodeNumber filename
      epNum = fromMaybe (idx + 1) parsed
  in object
    [ "streamId" .= Null
    , "episode" .= epNum
    , "epTitle" .= T.pack ("Episode " ++ show epNum)
    , "file" .= filename
    , "streamUrl" .= fieldText "streamUrl" ep
    , "isFtp" .= True
    ]

parseEpisodeNumber :: T.Text -> Maybe Int
parseEpisodeNumber filename =
  let tokens = map T.toLower (T.words (cleanupSeparators filename))
  in listToMaybe (mapMaybe (fmap snd . parseSxe) tokens)

seriesList :: CatalogState -> Request -> [Value]
seriesList state req =
  let requestedLimit = max 0 (queryInt "limit" 0 req)
      hasQ = maybe False (not . T.null . trimText) (queryText "q" req)
      ftpLimit = if requestedLimit > 0 && not hasQ then requestedLimit else 0
      local = csLocalSeries state
      seen = [T.toLower (firstText ["name", "title"] s) | s <- local]
      ftp = filter (\s -> T.toLower (firstText ["name", "title"] s) `notElem` seen) (ftpSeriesRouteItems ftpLimit state)
  in local ++ ftp

seriesResponse :: CatalogState -> Request -> Value
seriesResponse state req =
  let allSeries = seriesList state req
      hasPage = maybe False (const True) (queryText "page" req)
      hasQ = maybe False (not . T.null . trimText) (queryText "q" req)
      requestedLimit = max 0 (queryInt "limit" 0 req)
  in if hasPage || hasQ
       then
         let items = applyBrowseSearch "series" req allSeries
             (page, pages, pageItems, total) = pageSlice ZeroBased (queryInt "page" 0 req) (queryInt "limit" 72 req) items
         in object ["series" .= pageItems, "total" .= total, "page" .= page, "pages" .= pages]
       else Array (V.fromList (if requestedLimit > 0 then take requestedLimit allSeries else allSeries))

applyBrowseSearch :: T.Text -> Request -> [Value] -> [Value]
applyBrowseSearch kind req items =
  case queryText "q" req of
    Nothing -> items
    Just raw ->
      let terms = searchTerms raw
      in if null terms then items else map snd (rankSearch kind terms items)

rankSearch :: T.Text -> [T.Text] -> [Value] -> [(Int, Value)]
rankSearch kind terms items =
  take 120 $
    sortBy cmp
      [ (searchScore terms item, item)
      | item <- items
      , kindMatches kind item
      , let score = searchScore terms item
      , score > 0
      ]
  where
    cmp (sa, a) (sb, b) =
      case compare sb sa of
        EQ -> compare (firstText ["name", "title"] a) (firstText ["name", "title"] b)
        other -> other

kindMatches :: T.Text -> Value -> Bool
kindMatches "movie" item = fieldText "type" item /= "series"
kindMatches "series" item = fieldText "type" item == "series" || field "seasons" item /= Null
kindMatches _ _ = True

searchScore :: [T.Text] -> Value -> Int
searchScore terms item =
  let name = normalizeSearch (canonicalTitle (firstText ["name", "title", "file", "filename"] item) (fieldText "year" item))
      fileText = normalizeSearch (firstText ["file", "filename", "streamUrl"] item)
      hay = normalizeSearch (T.unwords
        [ name
        , firstText ["name", "title"] item
        , firstText ["file", "filename", "streamUrl"] item
        , fieldText "overview" item
        , fieldText "genre" item
        , fieldText "category" item
        , fieldText "language" item
        , fieldText "year" item
        ])
      phrase = T.unwords terms
      allHit = all (`T.isInfixOf` hay) terms
      exactName = if name == phrase then 9000 else 0
      startName = if phrase `T.isPrefixOf` name then 7600 else 0
      inName = if phrase `T.isInfixOf` name then 5400 else 0
      inFile = if phrase `T.isInfixOf` fileText then 1300 else 0
      art = if field "poster" item /= Null || field "backdrop" item /= Null then 420 else 0
      source = if field "isMassiveCatalog" item == Bool True then 0 else 260
      rating = round (min 75 (ratingNum item * 7))
      yearBonus = min 25 (max 0 ((yearNum item - 1980) `div` 2))
  in if not allHit then 0 else maximum [exactName, startName, inName, inFile, 1] + art + source + rating + yearBonus

searchTerms :: T.Text -> [T.Text]
searchTerms =
  take 8 . filter keep . T.words . normalizeSearch
  where
    stop = ["in", "on", "of", "to", "a", "an", "the", "and", "or", "for", "with", "by", "from"]
    keep t = T.length t >= 2 && t `notElem` stop

normalizeSearch :: T.Text -> T.Text
normalizeSearch =
  T.unwords . T.words . T.map repl . T.toLower
  where
    repl '&' = ' '
    repl '\'' = ' '
    repl '`' = ' '
    repl c | isAlphaNum c = c
           | otherwise = ' '

canonicalTitle :: T.Text -> T.Text -> T.Text
canonicalTitle raw year =
  let cleaned = T.unwords . T.words $ T.map (\c -> if c `elem` (".-_[](){}+" :: String) then ' ' else c) raw
      cutYear = if T.null year then cleaned else fst (T.breakOn year cleaned)
      tokens = filter keepToken (T.words (if T.null cutYear then cleaned else cutYear))
  in if null tokens then cleaned else T.unwords tokens
  where
    junk =
      [ "480p", "576p", "720p", "1080p", "1440p", "2160p", "4k", "8k"
      , "uhd", "hdr", "web", "webdl", "webrip", "bluray", "brrip", "x264"
      , "x265", "hevc", "aac", "dts", "dual", "audio", "hindi", "english"
      ]
    keepToken t =
      let k = T.toLower t
      in k `notElem` junk && not (T.length t == 4 && T.all isDigit t)

sectionResponse :: CatalogState -> Request -> T.Text -> Value
sectionResponse state req key =
  let page = max 0 (queryInt "page" 0 req)
      limit = min 120 (max 1 (queryInt "limit" 24 req))
      list = sectionList state key
      start = page * limit
      total = length list
      pages = pageCount limit total
  in object
    [ "key" .= key
    , "items" .= take limit (drop start list)
    , "total" .= total
    , "page" .= page
    , "pages" .= pages
    ]

sectionList :: CatalogState -> T.Text -> [Value]
sectionList state key =
  let moviesOnly = normalMovieItems state
      seriesOnly = normalSeriesItems state
      allItems = moviesOnly ++ seriesOnly
      pick wordsToFind = homeSort [item | item <- allItems, hasAny (homeText item) wordsToFind]
      byYearDesc xs = sortBy (\a b -> compare (yearNum b) (yearNum a)) xs
      result = case key of
        "series" -> homeSort seriesOnly
        "allMovies" -> homeSort moviesOnly
        "topRated" -> homeSort [i | i <- allItems, ratingNum i >= 8]
        "new" -> byYearDesc (homeSort allItems)
        "recentlyAdded" -> byYearDesc (homeSort allItems)
        "trending" -> take 300 (homeSort allItems)
        "mostWatchedToday" -> take 300 (homeSort allItems)
        "netflix" -> take 500 (featuredSection allItems "netflix")
        "marvel" -> take 500 (featuredSection allItems "marvel")
        "dc" -> take 500 (featuredSection allItems "dc")
        "universal" -> studioSection allItems "universal"
        "disney" -> studioSection allItems "disney"
        "warner" -> studioSection allItems "warner"
        "hbo" -> studioSection allItems "hbo"
        "apple" -> studioSection allItems "apple"
        "indian" -> pick ["hindi", "bangla", "bengali", "kolkata", "tamil", "telugu", "malayalam", "kannada", "punjabi", "bollywood", "south indian", "india"]
        "anime" -> pick ["anime", "animation", "japanese", "demon slayer", "naruto", "one piece", "jujutsu", "attack on titan"]
        "koreanDrama" -> pick ["korean", "k-drama", "k drama", "korea"]
        "horrorNights" -> pick ["horror", "ghost", "haunt", "demon", "evil", "conjuring", "scream", "strangers"]
        "cyberpunkScifi" -> pick ["sci-fi", "science fiction", "cyberpunk", "space", "alien", "robot", "ai", "future", "matrix", "blade runner"]
        "mindfuck" -> pick ["mind", "dream", "memory", "loop", "inception", "tenet", "shutter island", "memento", "black mirror"]
        "cultClassics" -> pick ["cult", "classic", "pulp fiction", "fight club", "trainspotting", "big lebowski"]
        "a24" -> pick ["a24", "hereditary", "midsommar", "moonlight", "lady bird", "ex machina", "uncut gems", "everything everywhere"]
        "nostalgia90s" -> homeSort [i | i <- allItems, yearNum i >= 1990, yearNum i <= 1999]
        "midnightCinema" -> pick ["midnight", "neon", "noir", "cult", "horror", "thriller"]
        "trueCrime" -> pick ["true crime", "crime documentary", "serial killer", "murder", "detective"]
        "psychThriller" -> pick ["psychological", "thriller", "mystery", "suspense", "obsession"]
        "adultAnimation" -> pick ["adult animation", "rick and morty", "family guy", "south park", "bojack"]
        "postApocalyptic" -> pick ["apocalypse", "post-apocalyptic", "zombie", "wasteland", "last of us", "walking dead"]
        "feelGood" -> pick ["comedy", "family", "feel good", "romance", "adventure"]
        "darkComedy" -> pick ["dark comedy", "black comedy", "satire"]
        "timeTravel" -> pick ["time travel", "time loop", "back to the future", "timeline"]
        "spaceAi" -> pick ["space", "artificial intelligence", " ai ", "robot", "mars", "moon", "interstellar"]
        "crimeSyndicates" -> pick ["crime", "mafia", "gang", "cartel", "syndicate", "godfather", "peaky blinders"]
        "zombie" -> pick ["zombie", "undead", "walking dead", "resident evil"]
        "indieGems" -> pick ["indie", "festival", "independent"]
        "hiddenMasterpieces" -> take 500 (homeSort [i | i <- allItems, ratingNum i >= 7, hasArt i])
        "liveConcerts" -> pick ["concert", "music", "live", "documentary"]
        "documentaryVault" -> pick ["documentary", "docu", "nature", "history", "biography"]
        "ghibli" -> pick ["ghibli", "miyazaki", "spirited away", "totoro", "howl"]
        "romanceMidnight" -> pick ["romance", "romantic", "love", "relationship"]
        "comingSoon" -> homeSort [i | i <- allItems, yearNum i >= 2026]
        "drama" -> pick ["drama", "emotion", "life", "family"]
        "spanish" -> pick ["spanish", "latino", "latin", "mexico", "argentina", "colombia"]
        _ -> homeSort allItems
  in if null result then take 300 (homeSort allItems) else result

normalMovieItems :: CatalogState -> [Value]
normalMovieItems state =
  let local = map (insertFields [("type", String "movie"), ("_sourceRank", Number 0)]) (csLocalMovies state)
      ftp =
        [ object
          [ "id" .= T.pack ("ftp_home_" ++ show i)
          , "name" .= fieldText "title" m
          , "title" .= fieldText "title" m
          , "file" .= textFallback (fieldText "filename" m) ""
          , "poster" .= nullish (field "poster" m)
          , "backdrop" .= fallbackValue (field "backdrop" m) (field "poster" m)
          , "tmdbId" .= nullish (field "tmdbId" m)
          , "overview" .= textOr "" (field "overview" m)
          , "year" .= textOr "" (field "year" m)
          , "rating" .= nullish (field "rating" m)
          , "type" .= String "movie"
          , "genre" .= textOr "" (field "genre" m)
          , "category" .= textOr "" (field "category" m)
          , "language" .= textOr "" (field "language" m)
          , "productionCompanies" .= arrayOrEmpty (field "productionCompanies" m)
          , "streamUrl" .= fieldText "streamUrl" m
          , "isFtp" .= True
          , "_sourceRank" .= (1 :: Int)
          ]
        | (i, m) <- zip [(0 :: Int)..] (csCatalogMovies state)
        , not (isCartoonOrAnime m)
        ]
  in dedupeBy homeMovieKey (local ++ ftp)

normalSeriesItems :: CatalogState -> [Value]
normalSeriesItems state =
  let local = map (insertFields [("type", String "series"), ("_sourceRank", Number 0)]) (csLocalSeries state)
      ftp =
        [ insertFields [("_sourceRank", Number 1), ("id", String (T.pack ("ftp_series_home_" ++ show i))), ("category", textOr "" (field "category" s)), ("language", textOr "" (field "language" s))] (seriesRouteValue s)
        | (i, s) <- zip [(0 :: Int)..] (csCatalogSeries state)
        , not (isCartoonOrAnime s)
        ]
  in dedupeBy (\i -> T.toLower (firstText ["name", "title"] i) <> "|" <> fieldText "year" i) (local ++ ftp)

insertFields :: [(T.Text, Value)] -> Value -> Value
insertFields newFields (Object o) = Object (foldl' (\acc (k, v) -> KM.insert (fromText k) v acc) o newFields)
insertFields _ v = v

homeMovieKey :: Value -> T.Text
homeMovieKey item =
  T.toLower (firstText ["name", "title"] item)
    <> "|" <> fieldText "year" item
    <> "|" <> fieldText "tmdbId" item
    <> "|" <> fieldText "streamUrl" item

homeText :: Value -> T.Text
homeText item =
  T.toLower . T.unwords . filter (not . T.null) $
    [ fieldText "name" item
    , fieldText "title" item
    , fieldText "file" item
    , fieldText "filename" item
    , fieldText "overview" item
    , fieldText "genre" item
    , fieldText "category" item
    , fieldText "language" item
    , fieldText "year" item
    ] ++ valueListText "productionCompanies" item

hasAny :: T.Text -> [T.Text] -> Bool
hasAny text = any (`T.isInfixOf` text)

hasArt :: Value -> Bool
hasArt item = field "poster" item /= Null || field "backdrop" item /= Null

ratingNum :: Value -> Double
ratingNum item =
  case reads (T.unpack (fieldText "rating" item)) of
    ((n, _):_) -> n
    [] -> 0

yearNum :: Value -> Int
yearNum item =
  let digits = take 4 (dropWhile (not . isDigit) (T.unpack (fieldText "year" item)))
  in if length digits == 4 then readInt 0 digits else 0

homeSort :: [Value] -> [Value]
homeSort =
  sortBy cmp
  where
    cmp a b =
      compare (artScore b, ratingNum b, yearNum b) (artScore a, ratingNum a, yearNum a)
    artScore item = if hasArt item then (1 :: Int) else 0

featuredSection :: [Value] -> T.Text -> [Value]
featuredSection allItems key =
  let phrases = featuredPhrases key
      scored =
        [ (featuredScore phrases item, item)
        | item <- allItems
        , hasArt item
        , featuredScore phrases item > 0
        ]
  in map snd (sortBy (\(a, _) (b, _) -> compare b a) scored)

featuredScore :: [T.Text] -> Value -> Int
featuredScore phrases item =
  let titleText = normalizeSearch (T.unwords [firstText ["name", "title", "file", "filename"] item, fieldText "category" item])
      hitScores =
        [ if titleText == p then 320000 - i * 1000
          else if p `T.isPrefixOf` titleText then 230000 - i * 1000
          else if p `T.isInfixOf` titleText then 170000 - i * 1000
          else 0
        | (i, p) <- zip [(0 :: Int)..] phrases
        ]
  in maximum (0 : hitScores) + if hasArt item then 9000 else 0

featuredPhrases :: T.Text -> [T.Text]
featuredPhrases "netflix" =
  map normalizeSearch ["stranger things", "wednesday", "squid game", "money heist", "dark", "black mirror", "the witcher", "narcos", "ozark", "extraction", "extraction 2", "gray man"]
featuredPhrases "marvel" =
  map normalizeSearch ["avengers endgame", "avengers infinity war", "the avengers", "iron man", "captain america", "thor", "guardians of the galaxy", "spider man", "black panther", "doctor strange", "deadpool", "x men"]
featuredPhrases "dc" =
  map normalizeSearch ["the dark knight", "batman", "joker", "superman", "man of steel", "justice league", "wonder woman", "aquaman", "the flash", "suicide squad", "watchmen"]
featuredPhrases _ = []

studioSection :: [Value] -> T.Text -> [Value]
studioSection allItems key =
  let phrases = studioPhrases key
      scored =
        [ (studioScore phrases item, item)
        | item <- allItems
        , studioScore phrases item > 0
        ]
  in map snd (sortBy (\(a, _) (b, _) -> compare b a) scored)

studioScore :: [T.Text] -> Value -> Int
studioScore phrases item =
  let titleText = normalizeSearch (T.unwords [firstText ["name", "title", "file", "filename"] item, fieldText "category" item])
      phraseScore = maximum (0 : [if p `T.isInfixOf` titleText then 260 else 0 | p <- phrases])
      art = if hasArt item then 60 else 0
  in phraseScore + art + round (ratingNum item * 10) + max 0 (min 40 (yearNum item - 1985))

studioPhrases :: T.Text -> [T.Text]
studioPhrases "universal" = map normalizeSearch ["universal", "jurassic", "fast and furious", "jaws", "bourne", "mummy", "oppenheimer"]
studioPhrases "disney" = map normalizeSearch ["disney", "pixar", "toy story", "frozen", "moana", "star wars", "pirates of the caribbean"]
studioPhrases "warner" = map normalizeSearch ["warner", "harry potter", "lord of the rings", "matrix", "dune", "mad max", "inception", "barbie"]
studioPhrases "hbo" = map normalizeSearch ["hbo", "house of the dragon", "game of thrones", "last of us", "true detective", "succession"]
studioPhrases "apple" = map normalizeSearch ["apple tv", "ted lasso", "severance", "silo", "foundation", "morning show"]
studioPhrases _ = []
