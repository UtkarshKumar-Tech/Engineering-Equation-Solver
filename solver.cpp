#include <cmath>
#include <cctype>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <limits>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include <algorithm>

// A small recursive-descent parser for f(x). No third-party libraries required.
class Parser {
    const std::string s;
    size_t pos = 0;
    double x;

    void spaces() {
        while (pos < s.size() && std::isspace(static_cast<unsigned char>(s[pos]))) ++pos;
    }
    bool eat(char c) {
        spaces();
        if (pos < s.size() && s[pos] == c) { ++pos; return true; }
        return false;
    }
    std::string identifier() {
        spaces(); size_t start = pos;
        while (pos < s.size() && std::isalpha(static_cast<unsigned char>(s[pos]))) ++pos;
        return s.substr(start, pos - start);
    }
    double expression() {
        double v = term();
        while (true) {
            if (eat('+')) v += term();
            else if (eat('-')) v -= term();
            else break;
        }
        return v;
    }
    double term() {
        double v = unary();
        while (true) {
            if (eat('*')) v *= unary();
            else if (eat('/')) {
                double d = unary();
                if (d == 0.0) throw std::runtime_error("Division by zero.");
                v /= d;
            } else break;
        }
        return v;
    }
    double unary() {
        if (eat('+')) return unary();
        if (eat('-')) return -unary();
        return power();
    }
    // Right-associative exponentiation; -x^2 is interpreted as -(x^2).
    double power() {
        double v = primary();
        if (eat('^')) v = std::pow(v, unary());
        return v;
    }
    double primary() {
        spaces();
        if (eat('(')) {
            double v = expression();
            if (!eat(')')) throw std::runtime_error("Missing closing parenthesis.");
            return v;
        }
        if (pos < s.size() && (std::isdigit(static_cast<unsigned char>(s[pos])) || s[pos] == '.')) {
            char* end = nullptr;
            const char* start = s.c_str() + pos;
            double v = std::strtod(start, &end);
            if (end == start) throw std::runtime_error("Invalid number.");
            pos += static_cast<size_t>(end - start);
            return v;
        }
        std::string name = identifier();
        if (name.empty()) throw std::runtime_error("Expected a number, x, constant, or function.");
        if (name == "x") return x;
        if (name == "pi") return std::acos(-1.0);
        if (name == "e") return std::exp(1.0);
        if (!eat('(')) throw std::runtime_error("Unknown variable or function: " + name + ". Use x, pi, e, or a supported function.");
        double v = expression();
        if (!eat(')')) throw std::runtime_error("Missing closing parenthesis after function argument.");
        if (name == "sin") return std::sin(v);
        if (name == "cos") return std::cos(v);
        if (name == "tan") return std::tan(v);
        if (name == "exp") return std::exp(v);
        if (name == "log") {
            if (v <= 0) throw std::runtime_error("log(x) requires a positive argument.");
            return std::log(v);
        }
        if (name == "sqrt") {
            if (v < 0) throw std::runtime_error("sqrt(x) requires a nonnegative argument.");
            return std::sqrt(v);
        }
        if (name == "abs") return std::fabs(v);
        throw std::runtime_error("Unsupported function: " + name + ". Supported: sin, cos, tan, exp, log, sqrt, abs.");
    }
public:
    Parser(const std::string& expressionText, double value) : s(expressionText), x(value) {}
    double evaluate() {
        pos = 0;
        double result = expression();
        spaces();
        if (pos != s.size()) throw std::runtime_error("Unexpected characters near: " + s.substr(pos, 12));
        if (!std::isfinite(result)) throw std::runtime_error("Function returned a non-finite value; check its domain and input.");
        return result;
    }
};

static double f(const std::string& expr, double x) { return Parser(expr, x).evaluate(); }
static double derivative(const std::string& expr, double x) {
    double h = std::cbrt(std::numeric_limits<double>::epsilon()) * std::max(1.0, std::fabs(x));
    return (f(expr, x + h) - f(expr, x - h)) / (2.0 * h);
}

struct Row { std::vector<double> values; };
struct Result {
    bool converged = false;
    std::string status = "error";
    std::string message;
    double root = std::numeric_limits<double>::quiet_NaN();
    double residual = std::numeric_limits<double>::quiet_NaN();
    int iterations = 0;
    std::vector<std::string> columns;
    std::vector<Row> rows;
};

static Result solveInternal(const std::string& expr, int method, double p1, double p2, double tol, int maxIter) {
    Result r;
    if (expr.empty()) throw std::runtime_error("Enter an equation first.");
    if (!(std::isfinite(tol) && tol > 0)) throw std::runtime_error("Tolerance must be a positive finite number.");
    if (maxIter < 1 || maxIter > 10000) throw std::runtime_error("Maximum iterations must be between 1 and 10000.");
    // The expression is evaluated at the method's actual starting values below.
    // Do not test at an arbitrary x (such as x=1): valid functions like sqrt(x-2)
    // may be undefined there but valid throughout the user's chosen interval.

    if (method == 1) {
        double a = p1, b = p2;
        if (!std::isfinite(a) || !std::isfinite(b) || !(a < b)) throw std::runtime_error("Bisection requires finite bounds with a < b.");
        double fa = f(expr, a), fb = f(expr, b);
        r.columns = {"Iteration", "a", "b", "Midpoint c", "f(c)", "Half-width"};
        if (fa == 0.0) { r.converged=true; r.status="converged"; r.root=a; r.residual=fa; r.message="The lower endpoint is an exact root."; return r; }
        if (fb == 0.0) { r.converged=true; r.status="converged"; r.root=b; r.residual=fb; r.message="The upper endpoint is an exact root."; return r; }
        if ((fa > 0) == (fb > 0)) throw std::runtime_error("Bisection needs a sign change: f(a) and f(b) must have opposite signs.");
        for (int i=1; i<=maxIter; ++i) {
            double c = a + (b-a)/2.0;
            double fc = f(expr,c);
            double half = (b-a)/2.0;
            r.rows.push_back({{double(i),a,b,c,fc,half}});
            r.iterations=i; r.root=c; r.residual=fc;
            if (fc == 0.0 || half <= tol) { r.converged=true; r.status="converged"; r.message="The interval half-width is within the requested tolerance (or an exact root was found)."; return r; }
            if ((fa > 0) != (fc > 0)) { b=c; fb=fc; } else { a=c; fa=fc; }
        }
        r.status="max_iterations"; r.message="Maximum iterations reached before the tolerance was met."; return r;
    }
    if (method == 2) {
        double x = p1;
        if (!std::isfinite(x)) throw std::runtime_error("Initial guess must be finite.");
        r.columns = {"Iteration", "xₙ", "f(xₙ)", "f′(xₙ) approx.", "xₙ₊₁", "|Δx|"};
        double fx = f(expr,x);
        if (std::fabs(fx) <= tol) { r.converged=true; r.status="converged"; r.root=x; r.residual=fx; r.message="Initial guess already satisfies the residual tolerance."; return r; }
        for (int i=1; i<=maxIter; ++i) {
            fx=f(expr,x);
            double dfx=derivative(expr,x);
            if (!std::isfinite(dfx) || std::fabs(dfx) < 1e-14) throw std::runtime_error("Newton–Raphson stopped: derivative is zero or too close to zero at the current estimate.");
            double next=x-fx/dfx;
            if (!std::isfinite(next)) throw std::runtime_error("Newton–Raphson produced a non-finite estimate. Try a different initial guess.");
            double delta=std::fabs(next-x);
            double fnext=f(expr,next);
            r.rows.push_back({{double(i),x,fx,dfx,next,delta}});
            r.iterations=i; r.root=next; r.residual=fnext;
            if (std::fabs(fnext) <= tol || (delta <= tol && std::fabs(fnext) <= std::sqrt(tol))) {
                r.converged=true; r.status="converged"; r.message="The estimate converged within the requested tolerance."; return r;
            }
            x=next;
        }
        r.status="max_iterations"; r.message="Maximum iterations reached before convergence."; return r;
    }
    if (method == 3) {
        double x0=p1, x1=p2;
        if (!std::isfinite(x0) || !std::isfinite(x1) || x0 == x1) throw std::runtime_error("Secant requires two distinct finite initial guesses.");
        r.columns = {"Iteration", "xₙ₋₁", "xₙ", "f(xₙ₋₁)", "f(xₙ)", "xₙ₊₁", "|Δx|"};
        double f0=f(expr,x0), f1=f(expr,x1);
        if (std::fabs(f0) <= tol) { r.converged=true; r.status="converged"; r.root=x0; r.residual=f0; r.message="First initial guess already satisfies the residual tolerance."; return r; }
        if (std::fabs(f1) <= tol) { r.converged=true; r.status="converged"; r.root=x1; r.residual=f1; r.message="Second initial guess already satisfies the residual tolerance."; return r; }
        for (int i=1; i<=maxIter; ++i) {
            double denom=f1-f0;
            if (!std::isfinite(denom) || std::fabs(denom) < 1e-14) throw std::runtime_error("Secant stopped because successive function values are too close. Try different guesses.");
            double next=x1-f1*(x1-x0)/denom;
            if (!std::isfinite(next)) throw std::runtime_error("Secant produced a non-finite estimate. Try different initial guesses.");
            double delta=std::fabs(next-x1), fn=f(expr,next);
            r.rows.push_back({{double(i),x0,x1,f0,f1,next,delta}});
            r.iterations=i; r.root=next; r.residual=fn;
            if (std::fabs(fn) <= tol || (delta <= tol && std::fabs(fn) <= std::sqrt(tol))) {
                r.converged=true; r.status="converged"; r.message="The estimate converged within the requested tolerance."; return r;
            }
            x0=x1; f0=f1; x1=next; f1=fn;
        }
        r.status="max_iterations"; r.message="Maximum iterations reached before convergence."; return r;
    }
    throw std::runtime_error("Unknown numerical method. Choose Bisection, Newton-Raphson, or Secant.");
}

static std::string jsonEscape(const std::string& s) {
    std::ostringstream o;
    for (unsigned char c : s) {
        switch(c) {
            case '"': o << "\\\""; break;
            case '\\': o << "\\\\"; break;
            case '\n': o << "\\n"; break;
            case '\r': o << "\\r"; break;
            case '\t': o << "\\t"; break;
            default: if (c < 0x20) { o << " "; } else o << char(c);
        }
    }
    return o.str();
}
static void jsonNumber(std::ostringstream& o, double v) {
    if (std::isfinite(v)) o << std::setprecision(17) << v;
    else o << "null";
}
static std::string toJson(const Result& r) {
    std::ostringstream o;
    o << "{\"ok\":" << (r.status != "error" ? "true" : "false")
      << ",\"converged\":" << (r.converged ? "true" : "false")
      << ",\"status\":\"" << jsonEscape(r.status) << "\",\"message\":\"" << jsonEscape(r.message) << "\",\"root\":";
    jsonNumber(o,r.root); o << ",\"residual\":"; jsonNumber(o,r.residual);
    o << ",\"iterations\":" << r.iterations << ",\"columns\":[";
    for (size_t i=0;i<r.columns.size();++i) { if(i) o << ','; o << '"' << jsonEscape(r.columns[i]) << '"'; }
    o << "],\"rows\":[";
    for (size_t i=0;i<r.rows.size();++i) {
        if(i) o << ',';
        o << '[';
        for (size_t j=0;j<r.rows[i].values.size();++j) { if(j) o << ','; jsonNumber(o,r.rows[i].values[j]); }
        o << ']';
    }
    o << "]}";
    return o.str();
}

extern "C" {
// Returned memory is allocated with malloc; JavaScript must call _free on the pointer.
#ifdef __EMSCRIPTEN__
__attribute__((visibility("default")))
#endif
char* solve(const char* expression, int method, double p1, double p2, double tolerance, int maxIterations) {
    std::string output;
    try {
        Result r = solveInternal(expression ? expression : "", method, p1, p2, tolerance, maxIterations);
        output = toJson(r);
    } catch (const std::exception& e) {
        Result r; r.status="error"; r.message=e.what(); output=toJson(r);
    } catch (...) {
        Result r; r.status="error"; r.message="An unknown calculation error occurred."; output=toJson(r);
    }
    char* buffer = static_cast<char*>(std::malloc(output.size()+1));
    if (!buffer) return nullptr;
    std::memcpy(buffer, output.c_str(), output.size()+1);
    return buffer;
}
}
