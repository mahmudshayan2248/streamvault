module Main where
import Data.List (isInfixOf)
import System.Exit (exitFailure)

countMatches :: String -> [String] -> Int
countMatches needle rows = length (filter (isInfixOf needle) rows)

main :: IO ()
main = do
  text <- readFile "tools/home-feed-parity-v1/home-feed-contract-fixture.json"
  let rows = lines text
  let q = show
  let required = map q ["sections", "netflix-originals", "trending-now", "series", "new-to-streamvault", "all-movies", "items", "title", "type", "streamUrl", "filename"]
  let missing = [needle | needle <- required, not (needle `isInfixOf` text)]
  let itemBlocks = countMatches (q "items") rows
  let titleRows = countMatches (q "title") rows
  let typeRows = countMatches (q "type") rows
  putStrLn ("HOME_FEED_READER_ITEMS_BLOCKS=" ++ show itemBlocks)
  putStrLn ("HOME_FEED_READER_TITLE_ROWS=" ++ show titleRows)
  putStrLn ("HOME_FEED_READER_TYPE_ROWS=" ++ show typeRows)
  case missing of
    [] -> do
      if itemBlocks <= 0 || titleRows <= 0 || typeRows <= 0
        then do
          putStrLn "HOME_FEED_READER_FAIL"
          exitFailure
        else putStrLn "HOME_FEED_READER_PASS"
    bad -> do
      putStrLn ("HOME_FEED_READER_MISSING=" ++ show bad)
      putStrLn "HOME_FEED_READER_FAIL"
      exitFailure
