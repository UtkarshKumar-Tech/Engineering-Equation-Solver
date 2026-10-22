(() => {
  const form = document.getElementById('solver-form');
  const equation = document.getElementById('equation');
  const method = document.getElementById('method');
  const paramA = document.getElementById('param-a');
  const paramB = document.getElementById('param-b');
  const labelA = document.getElementById('label-a');
  const labelB = document.getElementById('label-b');
  const fieldB = document.getElementById('field-b');
  const solveButton = document.getElementById('solve-button');
  const inputError = document.getElementById('input-error');
  const wasmError = document.getElementById('wasm-error');
  const emptyState = document.getElementById('empty-state');
  const resultContent = document.getElementById('result-content');
  const tableEmpty = document.getElementById('table-empty');
  const tableScroll = document.getElementById('table-scroll');
  const table = document.getElementById('iteration-table');
  const tableFootnote = document.getElementById('table-footnote');
  const downloadButton = document.getElementById('download-csv');
  let lastResult = null;
  let lastColumns = [];
  let lastExpression = '';
  let lastMethod = '';
  let wasmModule = null;

  const methodNames = { '1': 'Bisection', '2': 'Newton–Raphson', '3': 'Secant' };
  const fmt = (value, digits = 10) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    return Number(value).toLocaleString('en-US', { maximumSignificantDigits: digits, useGrouping: false });
  };

  function updateMethodFields() {
    const selected = method.value;
    if (selected === '1') {
      labelA.textContent = 'Lower bound (a)';
      labelB.textContent = 'Upper bound (b)';
      fieldB.classList.remove('hidden');
      paramB.disabled = false; paramB.required = true;
      if (!paramA.value) paramA.value = '1';
      if (!paramB.value) paramB.value = '2';
    } else if (selected === '2') {
      labelA.textContent = 'Initial guess (x₀)';
      fieldB.classList.add('hidden');
      paramB.disabled = true; paramB.required = false;
    } else {
      labelA.textContent = 'First guess (x₀)';
      labelB.textContent = 'Second guess (x₁)';
      fieldB.classList.remove('hidden');
      paramB.disabled = false; paramB.required = true;
      if (!paramA.value) paramA.value = '1';
      if (!paramB.value) paramB.value = '2';
    }
  }
  method.addEventListener('change', updateMethodFields);
  updateMethodFields();

  document.querySelectorAll('[data-expression]').forEach(button => {
    button.addEventListener('click', () => {
      equation.value = button.dataset.expression;
      equation.focus();
    });
  });

  function showError(message) {
    inputError.textContent = message;
    inputError.classList.remove('hidden');
  }
  function clearError() {
    inputError.textContent = '';
    inputError.classList.add('hidden');
  }
  function renderTable(columns, rows) {
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    thead.replaceChildren(); tbody.replaceChildren();
    const headRow = document.createElement('tr');
    columns.forEach(name => {
      const th = document.createElement('th'); th.textContent = name; headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach((value, index) => {
        const td = document.createElement('td');
        td.textContent = index === 0 ? String(value) : fmt(value, 12);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tableEmpty.classList.toggle('hidden', rows.length > 0);
    tableScroll.classList.toggle('hidden', rows.length === 0);
    tableFootnote.classList.toggle('hidden', rows.length === 0);
    downloadButton.disabled = rows.length === 0;
  }
  function renderResult(result, expression, selectedMethod, tolerance) {
    emptyState.classList.add('hidden');
    resultContent.classList.remove('hidden');
    const banner = document.getElementById('status-banner');
    banner.className = 'status-banner ' + (result.converged ? 'success' : result.status === 'max_iterations' ? 'warning' : 'failure');
    banner.textContent = result.converged ? '✓ Converged' : result.status === 'max_iterations' ? '⚠ Maximum iterations reached' : 'Calculation could not converge';
    document.getElementById('root-value').textContent = fmt(result.root, 13);
    document.getElementById('root-equation').textContent = `${expression} = 0`;
    document.getElementById('residual-value').textContent = fmt(Math.abs(result.residual), 8);
    document.getElementById('iteration-value').textContent = String(result.iterations);
    document.getElementById('method-value').textContent = methodNames[selectedMethod];
    document.getElementById('tolerance-value').textContent = fmt(tolerance, 5);
    document.getElementById('result-message').textContent = result.message || '';
  }

  function ensureWasm() {
    if (wasmModule && wasmModule._solve) return Promise.resolve(wasmModule);
    if (typeof createSolverModule !== 'function') {
      return Promise.reject(new Error('solver.js was not found. Compile solver.cpp with Emscripten as described in README.md.'));
    }
    return createSolverModule({ print: () => {}, printErr: () => {} }).then(module => {
      wasmModule = module;
      if (!module._solve) throw new Error('The compiled module does not export the solve function. Recompile using the command in README.md.');
      return module;
    });
  }

  form.addEventListener('submit', async event => {
    event.preventDefault(); clearError(); wasmError.classList.add('hidden');
    const expr = equation.value.trim();
    const selectedMethod = method.value;
    const p1 = Number(paramA.value);
    const p2 = selectedMethod === '2' ? 0 : Number(paramB.value);
    const tolerance = Number(document.getElementById('tolerance').value);
    const maxIterations = Number(document.getElementById('max-iterations').value);
    if (!expr) return showError('Please enter a function f(x).');
    if (!Number.isFinite(p1)) return showError('Enter a valid finite initial value.');
    if (selectedMethod !== '2' && !Number.isFinite(p2)) return showError('Enter a valid finite second value.');
    if (!(Number.isFinite(tolerance) && tolerance > 0)) return showError('Tolerance must be a positive number.');
    if (!Number.isInteger(maxIterations) || maxIterations < 1 || maxIterations > 10000) return showError('Maximum iterations must be an integer from 1 to 10000.');
    if (selectedMethod === '1' && !(p1 < p2)) return showError('For Bisection, the lower bound must be less than the upper bound.');
    if (selectedMethod === '3' && p1 === p2) return showError('Secant requires two different initial guesses.');

    solveButton.disabled = true;
    solveButton.querySelector('span:first-child').textContent = 'Calculating…';
    try {
      const module = await ensureWasm();
      const exprPtr = module.stringToNewUTF8(expr);
      const outputPtr = module._solve(exprPtr, Number(selectedMethod), p1, p2, tolerance, maxIterations);
      module._free(exprPtr);
      if (!outputPtr) throw new Error('Could not allocate memory for the result.');
      let jsonText;
      try { jsonText = module.UTF8ToString(outputPtr); } finally { module._free(outputPtr); }
      const result = JSON.parse(jsonText);
      if (result.status === 'error') {
        showError(result.message || 'The solver could not process this equation.');
        return;
      }
      lastResult = result; lastColumns = result.columns || []; lastExpression = expr; lastMethod = methodNames[selectedMethod];
      renderResult(result, expr, selectedMethod, tolerance);
      renderTable(lastColumns, result.rows || []);
    } catch (error) {
      console.error(error);
      if (!wasmModule) wasmError.classList.remove('hidden');
      else showError(error.message || 'An unexpected error occurred.');
    } finally {
      solveButton.disabled = false;
      solveButton.querySelector('span:first-child').textContent = 'Calculate root';
    }
  });

  downloadButton.addEventListener('click', () => {
    if (!lastResult || !lastResult.rows || !lastResult.rows.length) return;
    const csvCell = value => {
      const text = String(value ?? '');
      return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    const lines = [lastColumns.map(csvCell).join(','), ...lastResult.rows.map(row => row.map(csvCell).join(','))];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'rootfinder-iterations.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  // Surface missing/failed WASM early; the actual module is loaded on first solve.
  window.addEventListener('error', event => {
    if (event.filename && event.filename.includes('solver.js')) wasmError.classList.remove('hidden');
  });
})();
