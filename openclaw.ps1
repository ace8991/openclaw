# OpenClaw launcher - ajoute au PATH et lance la commande
$env:PATH = "C:\Users\User\node22;C:\Program Files\Git\bin;" + $env:PATH + ";$env:USERPROFILE\npm-global"
Set-Location "C:\Users\User\clawdbot"
node openclaw.mjs $args
