// Follow-up 633 (PR 225, Blueprint C4.2 build rule): the size chart's words are in the product page's HTML from the
// first response, hidden, like the other folded words (PdpDetails, PdpRules), so a search engine reads the sizes and
// measurements; the chart window itself (PdpChartSheet) still loads on its own. Plain text, nothing to tap.

export interface ChartTextRow {
  size: string;
  values: string[];
}

export function PdpChartText({ name, sizeCol, cols, rows }: { name: string; sizeCol: string; cols: string[]; rows: ChartTextRow[] }) {
  if (!rows.length) return null;
  return (
    <div hidden data-testid="pdp-chart-text">
      <table>
        <caption>{name}</caption>
        <thead>
          <tr>
            <th scope="col">{sizeCol}</th>
            {cols.map((c, i) => (
              <th key={i} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.size}>
              <th scope="row">{r.size}</th>
              {r.values.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
