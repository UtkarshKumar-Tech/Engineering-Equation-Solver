@echo off
setlocal
em++ solver.cpp -std=c++17 -O2 -o solver.js -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME=createSolverModule -s "EXPORTED_FUNCTIONS=['_solve','_free']" -s "EXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToNewUTF8']" -s ALLOW_MEMORY_GROWTH=1
if errorlevel 1 (
  echo.
  echo Build failed. Check the Emscripten Command Prompt and compiler errors above.
  exit /b 1
)
echo.
echo Build complete. Upload index.html, styles.css, app.js, solver.cpp, solver.js, solver.wasm, and README.md to GitHub.
