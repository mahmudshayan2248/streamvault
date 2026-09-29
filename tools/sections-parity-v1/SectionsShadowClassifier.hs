{-# OPTIONS_GHC -Wall -Wno-unused-matches #-}
module Main where

import Data.Char (toLower)
import Data.List (intercalate, isPrefixOf)
import System.Environment (getArgs)
import System.IO (IOMode(ReadMode), hGetContents, hSetEncoding, utf8, withFile)

data Section = Section String String [String]

main :: IO ()
main = getArgs >>= run

run :: [String] -> IO ()
run args = readUtf8 (catalogPath args) >>= putStrLn . makeJson

readUtf8 :: FilePath -> IO String
readUtf8 filePath = withFile filePath ReadMode (\h -> hSetEncoding h utf8 >> hGetContents h >>= \contents -> length contents `seq` return contents)

catalogPath :: [String] -> String
catalogPath xs = if null xs then "catalog.json" else head xs

dq :: String
dq = [toEnum 34]

sections :: [Section]
sections = [Section "netflix" "Netflix Originals" ["netflix"], Section "marvel" "Marvel Studios" ["marvel"], Section "dc" "DC" ["dc comics","dc"], Section "trending" "Trending Now" ["trending","popular"], Section "series" "Series" ["seasons","episode"], Section "new" "New to StreamVault" ["2026","2025"], Section "universal" "Universal Pictures" ["universal"], Section "disney" "Disney" ["disney"], Section "warner" "Warner Bros" ["warner"], Section "hbo" "HBO" ["hbo"], Section "apple" "Apple TV+" ["apple tv","apple"], Section "indian" "Indian Movies & Drama" ["hindi","bengali","tamil","telugu","india"], Section "anime" "Anime" ["anime","animation","japanese"], Section "koreanDrama" "Korean Drama" ["korean","korea"], Section "horrorNights" "Horror Nights" ["horror"], Section "cyberpunkScifi" "Cyberpunk & Sci-Fi" ["science fiction","sci-fi","cyberpunk"], Section "topRated" "Top Rated" ["rating"], Section "allMovies" "All Movies" ["streamUrl","filename"]]

makeJson :: String -> String
makeJson raw = renderJson (map (sectionResult (lowerText raw)) sections)

lowerText :: String -> String
lowerText value = map toLower value

sectionResult :: String -> Section -> String
sectionResult raw section = renderSection section (sectionHits raw section)

sectionHits :: String -> Section -> Int
sectionHits raw (Section key label terms) = sum (map (\term -> countNeedle (lowerText term) raw) terms)

countNeedle :: String -> String -> Int
countNeedle needle source = if null needle then 0 else if null source then 0 else if needle `isPrefixOf` source then 1 + countNeedle needle (drop (length needle) source) else countNeedle needle (tail source)

renderJson :: [String] -> String
renderJson sectionRows = unlines [ "{", field "ok" "true", fieldText "source" "base-haskell-sections-shadow-classifier", field "sectionCount" (show (length sectionRows)), "  " ++ dq ++ "sections" ++ dq ++ ": [" ++ intercalate ", " sectionRows ++ "]", "}" ]

renderSection :: Section -> Int -> String
renderSection (Section key label terms) hits = "{" ++ intercalate ", " [ jsonPairText "key" key, jsonPairText "label" label, jsonPairNumber "estimatedHits" hits, jsonPairNumber "termCount" (length terms) ] ++ "}"

field :: String -> String -> String
field name value = "  " ++ dq ++ name ++ dq ++ ": " ++ value ++ ","

fieldText :: String -> String -> String
fieldText name value = field name (jsonString value)

jsonPairText :: String -> String -> String
jsonPairText name value = dq ++ name ++ dq ++ ": " ++ jsonString value

jsonPairNumber :: String -> Int -> String
jsonPairNumber name value = dq ++ name ++ dq ++ ": " ++ show value

jsonString :: String -> String
jsonString value = dq ++ concatMap escapeJson value ++ dq

escapeJson :: Char -> String
escapeJson c = if c == toEnum 34 then [toEnum 92, toEnum 34] else if c == toEnum 92 then [toEnum 92, toEnum 92] else if c == toEnum 10 then [toEnum 92, toEnum 110] else [c]