# Root Solver — Numerical Methods Dashboard

A responsive browser-based nonlinear equation solver powered by C++ compiled to WebAssembly. Choose a single root-finding method for an individual solution, or compare Bisection, Newton–Raphson, and Secant on the same equation.

## Features

- Single-method mode and all-method comparison mode
- Expression input for `f(x) = 0`
- Bisection interval, Newton initial guess, and Secant initial guesses
- Configurable tolerance and maximum iterations
- Comparison cards for root estimate, iteration count, function evaluations, residual, error estimate, observed order, and elapsed time
- Root-trajectory and residual-convergence charts in comparison mode
- Iteration-history table with CSV export
- Example equations and supported-expression help
- Responsive dark theme with clearer, form-first inputs

## Supported expression syntax

Use `x`, `pi`, and `e`; operators `+`, `-`, `*`, `/`, `^`; parentheses; and functions `sin`, `cos`, `tan`, `exp`, `log`, `sqrt`, and `abs`. Write multiplication explicitly, such as `2*x`. Trigonometric functions use radians.

Bisection requires a valid interval whose endpoint function values have opposite signs. Newton–Raphson and Secant can be sensitive to their initial guesses.

## Build on Windows

1. Install and activate Emscripten SDK.
2. Open a Command Prompt configured by `emsdk_env.bat` (Emscripten Command Prompt).
3. Change directory to this project folder.
4. Run:

   ```bat
   build-windows.bat
   ```

This generates `solver.js` and `solver.wasm` from `solver.cpp`.

## Test locally

From the project directory, run:

```bat
python -m http.server 8000
```

Open `http://localhost:8000`. Keep the server terminal open while testing.

## Publish

Upload `index.html`, `styles.css`, `app.js`, `solver.cpp`, the newly generated `solver.js` and `solver.wasm`, and `README.md` to the root of your GitHub Pages repository. Commit the update and wait for Pages to deploy.


## Updated input behaviour (v3)

- Use **Solve one method** to focus on Bisection, Newton–Raphson, or Secant; use **Compare all three** to compare them side by side.
- In single-method mode, only the inputs required by the selected method are shown. Bisection shows lower/upper bounds, Newton–Raphson shows one initial guess, and Secant shows two initial guesses.
- Tolerance is entered as an ordinary decimal such as `0.01`, `0.001`, or `0.000001`.
- The convergence charts remain available in both single-method and comparison modes.

After changing `solver.cpp`, rebuild `solver.js` and `solver.wasm` with `build-windows.bat` in the Emscripten Command Prompt.

## Updated input behaviour (v4)

- Choose the displayed decimal precision from 2 to 12 places; this affects result metrics and iteration-table values, not the solver's internal calculation precision.
- In Bisection mode, the lower and upper bounds appear side by side.
