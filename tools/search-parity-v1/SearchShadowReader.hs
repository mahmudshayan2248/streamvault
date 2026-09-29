{-# OPTIONS_GHC -Wall -Wno-unused-matches #-}
module Main where

import Data.Char (isSpace, toLower)
import Data.List (intercalate, isPrefixOf, tails)
import System.Environment (getArgs)
import System.IO (IOMode(ReadMode), hGetContents, hSetEncoding, utf8, withFile)
import Text.Read (readMaybe)

main :: IO ()
main = getArgs >>= run

run :: [String] -> IO ()
run args = readUtf8 (catalogPath args) >>= \raw -> putStrLn (makeJson args raw)

readUtf8 :: FilePath -> IO String
readUtf8 filePath = withFile filePath ReadMode (\h -> hSetEncoding h utf8 >> hGetContents h >>= \contents -> length contents `seq` return contents)

catalogPath :: [String] -> String
catalogPath xs = if null xs then "catalog.json" else head xs

queryArg :: [String] -> String
queryArg xs = if length xs < 2 then "the" else xs !! 1

argInt :: Int -> [String] -> Int -> Int
argInt n xs fallback = case drop n xs of { [] -> fallback; values -> maybe fallback id (readMaybe (head values)) }

limitArg :: [String] -> Int
limitArg args = max 1 (argInt 2 args 12)

dq :: String
dq = [toEnum 34]

titleKey :: String
titleKey = dq ++ "title" ++ dq

nameKey :: String
nameKey = dq ++ "name" ++ dq

makeJson :: [String] -> String -> String
makeJson args raw = renderJson (queryArg args) (limitArg args) (searchHits args raw) (fieldEstimate raw)

searchHits :: [String] -> String -> [String]
searchHits args raw = take (limitArg args) (filter (matchesQuery (queryArg args)) (allTitles raw))

fieldEstimate :: String -> Int
fieldEstimate raw = countNeedle titleKey raw + countNeedle nameKey raw

allTitles :: String -> [String]
allTitles raw = collectValues titleKey raw ++ collectValues nameKey raw

matchesQuery :: String -> String -> Bool
matchesQuery query title = containsText (lowerText query) (lowerText title)

lowerText :: String -> String
lowerText value = map toLower value

containsText :: String -> String -> Bool
containsText needle hay = if null needle then True else any (isPrefixOf needle) (tails hay)

collectValues :: String -> String -> [String]
collectValues key source = case findKey key source of { Nothing -> []; Just rest -> case valueAfterColon rest of { Nothing -> collectValues key (safeTail source); Just pair -> fst pair : collectValues key (snd pair) } }

safeTail :: String -> String
safeTail value = if null value then [] else tail value

findKey :: String -> String -> Maybe String
findKey key source = if null source then Nothing else if key `isPrefixOf` source then Just (drop (length key) source) else findKey key (tail source)

valueAfterColon :: String -> Maybe (String, String)
valueAfterColon source = case dropUntilColon source of { Nothing -> Nothing; Just rest -> valueAfterSpaces (dropWhile isSpace rest) }

dropUntilColon :: String -> Maybe String
dropUntilColon source = if null source then Nothing else if head source == ':' then Just (tail source) else dropUntilColon (tail source)

valueAfterSpaces :: String -> Maybe (String, String)
valueAfterSpaces source = if null source then Nothing else if head source == toEnum 34 then Just (readJsonBareString (tail source)) else Nothing

readJsonBareString :: String -> (String, String)
readJsonBareString source = readJsonBareStringAcc [] source

readJsonBareStringAcc :: String -> String -> (String, String)
readJsonBareStringAcc acc source = if null source then (reverse acc, []) else if head source == toEnum 34 then (reverse acc, tail source) else readJsonBareStringAcc (head source : acc) (tail source)

countNeedle :: String -> String -> Int
countNeedle needle source = if null needle then 0 else if null source then 0 else if needle `isPrefixOf` source then 1 + countNeedle needle (drop (length needle) source) else countNeedle needle (tail source)

renderJson :: String -> Int -> [String] -> Int -> String
renderJson query limitNum hits estimate = unlines [ "{", field "ok" "true", fieldText "source" "base-haskell-search-shadow-reader", fieldText "query" query, field "limit" (show limitNum), field "count" (show (length hits)), field "estimatedTitleFields" (show estimate), "  " ++ dq ++ "items" ++ dq ++ ": [" ++ intercalate ", " (map jsonString hits) ++ "]", "}" ]

field :: String -> String -> String
field name value = "  " ++ dq ++ name ++ dq ++ ": " ++ value ++ ","

fieldText :: String -> String -> String
fieldText name value = field name (jsonString value)

jsonString :: String -> String
jsonString value = dq ++ concatMap escapeJson value ++ dq

escapeJson :: Char -> String
escapeJson c = if c == toEnum 34 then [toEnum 92, toEnum 34] else if c == toEnum 92 then [toEnum 92, toEnum 92] else if c == toEnum 10 then [toEnum 92, toEnum 110] else [c]