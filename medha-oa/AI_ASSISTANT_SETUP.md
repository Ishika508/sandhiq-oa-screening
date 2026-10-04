# SANDHIQ Assistant Setup

The assistant is optional and runs locally through Ollama. SANDHIQ remains usable offline without it.

1. Install Ollama from [ollama.com](https://ollama.com) for Windows, macOS, or Linux.
2. Pull the recommended local model:

   ```bash
   ollama pull llama3.2:3b
   ```

   `phi3:mini` is a lighter alternative. `llama3.1:8b` can provide higher quality on a machine with a good GPU.
3. Ollama serves its local API at `http://localhost:11434` without an API key. SANDHIQ calls it through its Next.js route, so the browser does not need direct Ollama CORS access.
4. Start the app with `npm run dev` or `npm start`. If Ollama is not running, the assistant shows a setup message and the rest of the app continues normally.

Set `OLLAMA_MODEL` to use a different installed model. The default is `llama3.2:3b`.