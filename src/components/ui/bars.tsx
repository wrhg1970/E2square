// Barras horizontales accesibles (tabla con nombre, barra y valor).
export function Bars({ rows, label }: { rows: { key: string; name: string; value: number; text: string }[]; label: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <table className="w-full text-sm" aria-label={label}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} title={`${r.name}: ${r.text}`}>
            <th scope="row" className="w-40 py-1.5 pr-3 text-left font-normal">{r.name}</th>
            <td className="py-1.5">
              <div className="h-3 rounded-sm bg-primary" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 4 : 0 }} />
            </td>
            <td className="w-32 py-1.5 pl-3 text-right tabular-nums">{r.text}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
