import { useEffect, useState } from "react";
import { fetchJson } from "./api.js";
import { money } from "./format.js";

// Basic modal showing one product's day-by-day history. Day numbers open that day's Daily Report.
export default function ProductHistory({ runId, productId, onClose, onDay }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    fetchJson(`/api/runs/${runId}/products/${productId}`).then(setData).catch((e) => setError(e.message));
  }, [runId, productId]);

  const p = data && data.product;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>Close</button>
        {error && <p className="error">Could not load product history: {error}</p>}
        {!data && !error && <p className="loading">Loading...</p>}
        {data && (
          <>
            <h3>{p.product_id} {p.name}</h3>
            <p>
              {p.category}. Cost {money(p.unit_cost, 2)}, price {money(p.unit_price, 2)}, opening stock {p.initial_qty}.{" "}
              {p.is_perishable ? `Perishable, shelf life ${p.shelf_life_days} days.` : "Non-perishable."}
            </p>
            <div className="modal-body">
              <table>
                <thead>
                  <tr>
                    <th>Day</th><th className="num">Received</th><th className="num">Sold</th>
                    <th className="num">Expired</th><th className="num">Ordered (arrives next day)</th><th className="num">Closing stock</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => (
                    <tr key={d.day}>
                      <td><button className="link" onClick={() => { onClose(); onDay(d.day); }}>{d.day}</button></td>
                      <td className="num">{d.received}</td>
                      <td className="num">{d.sold}</td>
                      <td className="num">{d.expired}</td>
                      <td className="num">{d.ordered}</td>
                      <td className="num">{d.closing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
