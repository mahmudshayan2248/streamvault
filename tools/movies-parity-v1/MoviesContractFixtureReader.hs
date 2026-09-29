module Main where
import Data.List (isInfixOf)
import System.Exit (exitFailure)

main :: IO ()
main = do
  text <- readFile "tools/movies-parity-v1/movies-contract-fixture.json"
  let targetType = show "type" ++ ": " ++ show "movie"
  let targetItems = show "items"
  let targetStreamUrl = show "streamUrl"
  let rows = length (filter (isInfixOf targetType) (lines text))
  let hasItems = targetItems `isInfixOf` text
  let hasStreamUrl = targetStreamUrl `isInfixOf` text
  putStrLn ("MOVIES_HASKELL_READER_ROWS=" ++ show rows)
  putStrLn ("MOVIES_HASKELL_READER_HAS_ITEMS=" ++ show hasItems)
  putStrLn ("MOVIES_HASKELL_READER_HAS_STREAM_URL=" ++ show hasStreamUrl)
  if rows <= 0 || not hasItems || not hasStreamUrl
    then do
      putStrLn "MOVIES_HASKELL_READER_FAIL"
      exitFailure
    else putStrLn "MOVIES_HASKELL_READER_PASS"
