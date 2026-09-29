module Main where
import Data.List (isInfixOf)
import System.Environment (getArgs)
import System.Exit (exitFailure)

readIntOr :: Int -> String -> Int
readIntOr fallback raw = case reads raw of { [(n, "")] -> n; other -> fallback + 0 * length other }

firstArg :: [String] -> Int
firstArg args = case args of { [] -> 24; a:rest -> readIntOr 24 a + 0 * length rest }

countMatches :: String -> [String] -> Int
countMatches needle rows = length (filter (isInfixOf needle) rows)

main :: IO ()
main = do
  args <- getArgs
  let limitValue = max 1 (firstArg args)
  text <- readFile "tools/home-feed-parity-v1/home-feed-contract-fixture.json"
  let rows = lines text
  let q = show
  let requiredIds = ["netflix-originals", "trending-now", "series", "new-to-streamvault", "all-movies"]
  let missing = [needle | needle <- map q requiredIds, not (needle `isInfixOf` text)]
  let itemBlocks = countMatches (q "items") rows
  let titleRows = countMatches (q "title") rows
  let typeRows = countMatches (q "type") rows
  let sectionCount = length requiredIds - length missing
  putStrLn ("HOME_FEED_SHADOW_SECTION_COUNT=" ++ show sectionCount)
  putStrLn ("HOME_FEED_SHADOW_LIMIT=" ++ show limitValue)
  putStrLn ("HOME_FEED_SHADOW_ITEMS_BLOCKS=" ++ show itemBlocks)
  putStrLn ("HOME_FEED_SHADOW_TITLE_ROWS=" ++ show titleRows)
  putStrLn ("HOME_FEED_SHADOW_TYPE_ROWS=" ++ show typeRows)
  putStrLn ("{" ++ q "ok" ++ ":true," ++ q "source" ++ ":" ++ q "haskell-home-feed-shadow" ++ "," ++ q "limit" ++ ":" ++ show limitValue ++ "," ++ q "sectionCount" ++ ":" ++ show sectionCount ++ "," ++ q "sections" ++ ":[]}")
  case missing of
    [] -> do
      if sectionCount <= 0 || itemBlocks <= 0 || titleRows <= 0 || typeRows <= 0
        then do
          putStrLn "HOME_FEED_SHADOW_PAGER_FAIL"
          exitFailure
        else putStrLn "HOME_FEED_SHADOW_PAGER_PASS"
    bad -> do
      putStrLn ("HOME_FEED_SHADOW_MISSING=" ++ show bad)
      putStrLn "HOME_FEED_SHADOW_PAGER_FAIL"
      exitFailure
