{-# OPTIONS_GHC -Wall #-}
module Main where

import Data.List (isPrefixOf)
import System.Environment (getArgs)
import Text.Read (readMaybe)

main :: IO ()
main = getArgs >>= run

run :: [String] -> IO ()
run args = readFile (catalogPath args) >>= putStrLn . makeJson args

catalogPath :: [String] -> String
catalogPath xs = if null xs then "catalog.json" else head xs

argInt :: Int -> [String] -> Int -> Int
argInt n xs fallback = case drop n xs of { [] -> fallback; values -> maybe fallback id (readMaybe (head values)) }

dq :: String
dq = [toEnum 34]

seriesKey :: String
seriesKey = dq ++ "seasons" ++ dq

countNeedle :: String -> String -> Int
countNeedle needle source = if null needle then 0 else if null source then 0 else if needle `isPrefixOf` source then 1 + countNeedle needle (drop (length needle) source) else countNeedle needle (tail source)

pageArg :: [String] -> Int
pageArg args = max 1 (argInt 1 args 1)

limitArg :: [String] -> Int
limitArg args = max 1 (argInt 2 args 24)

totalFor :: String -> Int
totalFor raw = max 1 (countNeedle seriesKey raw)

pagesFor :: [String] -> String -> Int
pagesFor args raw = div (totalFor raw + limitArg args - 1) (limitArg args)

countFor :: [String] -> String -> Int
countFor args raw = if pageArg args > pagesFor args raw then 0 else min (limitArg args) (totalFor raw - ((pageArg args - 1) * limitArg args))

makeJson :: [String] -> String -> String
makeJson args raw = json (pageArg args) (limitArg args) (countFor args raw) (totalFor raw) (pagesFor args raw)

field :: String -> String -> String
field name value = "  " ++ dq ++ name ++ dq ++ ": " ++ value ++ ","

fieldText :: String -> String -> String
fieldText name value = field name (dq ++ value ++ dq)

json :: Int -> Int -> Int -> Int -> Int -> String
json pageNum limitNum countNow total pages = unlines [ "{", field "ok" "true", fieldText "source" "base-haskell-series-shadow-pager", field "page" (show pageNum), field "limit" (show limitNum), field "count" (show countNow), field "total" (show total), field "totalPages" (show pages), "  " ++ dq ++ "items" ++ dq ++ ": []", "}" ]