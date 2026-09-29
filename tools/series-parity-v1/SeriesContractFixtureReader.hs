module Main where
import Data.List (isInfixOf)
import System.Exit (exitFailure)

countMatches :: String -> [String] -> Int
countMatches needle rows = length (filter (isInfixOf needle) rows)

main :: IO ()
main = do
  text <- readFile "tools/series-parity-v1/series-contract-fixture.json"
  let rows = lines text
  let q = show
  let required = map q ["items", "series", "title", "type", "filename", "streamUrl", "sourceIndex", "catalogSeriesTotal", "fixtureSeriesTotal"]
  let missing = [needle | needle <- required, not (needle `isInfixOf` text)]
  let itemBlocks = countMatches (q "items") rows
  let titleRows = countMatches (q "title") rows
  let typeRows = countMatches (q "type" ++ ": " ++ q "series") rows
  putStrLn ("SERIES_READER_ITEMS_BLOCKS=" ++ show itemBlocks)
  putStrLn ("SERIES_READER_TITLE_ROWS=" ++ show titleRows)
  putStrLn ("SERIES_READER_TYPE_ROWS=" ++ show typeRows)
  case missing of
    [] -> do
      if itemBlocks <= 0 || titleRows <= 0 || typeRows <= 0
        then do
          putStrLn "SERIES_READER_FAIL"
          exitFailure
        else putStrLn "SERIES_READER_PASS"
    bad -> do
      putStrLn ("SERIES_READER_MISSING=" ++ show bad)
      putStrLn "SERIES_READER_FAIL"
      exitFailure
