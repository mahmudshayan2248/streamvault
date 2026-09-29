module CryptoHashCompat (sha1Hex16) where

-- Stable placeholder. Replace with cryptohash-sha1 if you want real SHA1 ids.
sha1Hex16 :: String -> String
sha1Hex16 input = take 16 $ cycle $ show (abs (foldl step (5381 :: Int) input))
  where step h c = h * 33 + fromEnum c
