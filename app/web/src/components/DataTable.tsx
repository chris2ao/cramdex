export function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto border border-edge">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-panel-2 text-left">
            {headers.map((h) => (
              <th key={h} className="mono-label px-3 py-2 text-[9px] text-faint">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-edge transition-colors
                                   duration-120 hover:bg-panel-2">
              {row.map((cell, j) => <td key={j} className="px-3 py-2">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
