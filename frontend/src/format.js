// Small number formatters shared by the report pages.
export const money = (x, decimals = 0) =>
  "A$" + Number(x).toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
export const int = (x) => Number(x).toLocaleString("en-AU", { maximumFractionDigits: 0 });
export const pct = (x) => (x * 100).toFixed(1) + "%";
