cp ./ai-arena.server.config.json ./ai-arena.config.json
zip quoridor-server -r src tsconfig.json package.json ai-arena.config.json
rm ai-arena.config.json

