module Main where
import Data.List (isInfixOf)
import System.Environment (getArgs)
import System.Exit (exitFailure)

readIntOr :: Int -> String -> Int
readIntOr fallback raw = case reads raw of { [(n, "")] -> n; other -> fallback + 0 * length other }

firstArg :: [String] -> Int
firstArg args = case args of { [] -> 0; a:rest -> readIntOr 0 a + 0 * length rest }

secondArg :: [String] -> Int
secondArg args = case drop 1 args of { [] -> 24; b:rest -> readIntOr 24 b + 0 * length rest }

ceilDiv :: Int -> Int -> Int
ceilDiv a b = (a + b - 1) `div` b

main :: IO ()
main = do
  args <- getArgs
  let page = max 0 (firstArg args)
  let limitValue = max 1 (secondArg args)
  text <- readFile "tools/movies-parity-v1/movies-contract-fixture.json"
  let targetType = show "type" ++ ": " ++ show "movie"
  let total = length (filter (isInfixOf targetType) (lines text))
  let selectedRows = min limitValue (max 0 (total - (page * limitValue)))
  let pages = if total <= 0 then 0 else ceilDiv total limitValue
  let q = show
  putStrLn ("MOVIES_SHADOW_TOTAL=" ++ show total)
  putStrLn ("MOVIES_SHADOW_PAGE=" ++ show page)
  putStrLn ("MOVIES_SHADOW_LIMIT=" ++ show limitValue)
  putStrLn ("MOVIES_SHADOW_ROWS=" ++ show selectedRows)
  putStrLn ("MOVIES_SHADOW_PAGES=" ++ show pages)
  putStrLn ("{" ++ q "movies" ++ ":[]," ++ q "total" ++ ":" ++ show total ++ "," ++ q "page" ++ ":" ++ show page ++ "," ++ q "pages" ++ ":" ++ show pages ++ "}")
  if total <= 0 || selectedRows <= 0
    then do
      putStrLn "MOVIES_SHADOW_PAGER_FAIL"
      exitFailure
    else putStrLn "MOVIES_SHADOW_PAGER_PASS"
