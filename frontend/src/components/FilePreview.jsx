import React, { useEffect, useState } from 'react';
import { api, fmtBytes, mediaUrl } from '../api.js';

function Table({ columns, rows }) {
  return (
    <div className="table-wrap">
      <table className="table table-compact">
        <thead><tr>{columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export default function FilePreview({ fileId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [sheet, setSheet] = useState(0);
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    setData(null);
    api.previewFile(fileId).then(setData).catch((e) => setError(e.message));
  }, [fileId]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="preview-title">
            {data?.filename || 'Loading…'}
            {data && <span className="muted small"> · {fmtBytes(data.size)} · {data.kind}</span>}
          </h2>
          <div className="modal-head-actions">
            {data && <a className="btn btn-ghost btn-sm" href={mediaUrl(data.download_url)}>⬇ Download</a>}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="modal-body preview-body">
          {error && <p className="toast-err inline">{error}</p>}
          {!data && !error && <p className="muted">Loading preview…</p>}

          {data?.kind === 'image' && (
            <div className="preview-center"><img className="preview-image" src={mediaUrl(data.raw_url)} alt={data.filename} /></div>
          )}

          {data?.kind === 'pdf' && (
            <>
              <iframe className="preview-pdf" src={mediaUrl(data.raw_url)} title={data.filename} />
              {data.extracted_text && (
                <details className="extracted" open={false}>
                  <summary>Extracted text</summary>
                  <pre className="code">{data.extracted_text}</pre>
                </details>
              )}
            </>
          )}

          {data?.kind === 'video' && (
            <div className="preview-center"><video className="preview-video" src={mediaUrl(data.raw_url)} controls autoPlay={false} /></div>
          )}

          {data?.kind === 'audio' && (
            <div className="preview-center preview-audio-wrap">
              <div className="audio-icon">🎵</div>
              <audio src={mediaUrl(data.raw_url)} controls />
            </div>
          )}

          {data?.kind === 'text' && (
            <>
              <div className="lang-chip">{data.language}</div>
              <pre className="code">{data.content}</pre>
            </>
          )}

          {data?.kind === 'table' && <Table columns={data.columns} rows={data.rows} />}

          {data?.kind === 'sheets' && (
            <>
              <div className="sheet-tabs">
                {(data.sheets || []).map((s, i) => (
                  <button key={i} className={`sheet-tab ${i === sheet ? 'active' : ''}`} onClick={() => setSheet(i)}>
                    {s.name}
                  </button>
                ))}
              </div>
              {data.sheets?.[sheet] && <Table columns={data.sheets[sheet].columns} rows={data.sheets[sheet].rows} />}
              {data.error && <p className="toast-err inline">{data.error}</p>}
            </>
          )}

          {data?.kind === 'document' && <pre className="code doc-preview">{data.content}</pre>}

          {data?.kind === 'archive' && (
            <ul className="archive-list">
              {(data.entries || []).map((e, i) => (
                <li key={i}>
                  <span>{e.is_dir ? '📁' : '📄'}</span>
                  <span className="mono">{e.name}</span>
                  <span className="muted small">{e.is_dir ? '' : fmtBytes(e.size)}</span>
                </li>
              ))}
              <p className="muted small">Archive contents listed — download to extract.</p>
            </ul>
          )}

          {data?.kind === 'download' && (
            <div className="preview-center">
              <div className="big-file-icon">📄</div>
              <p className="muted">No inline preview for this file type — but you can still download it.</p>
              <a className="btn btn-primary" href={mediaUrl(data.download_url)}>⬇ Download {data.filename}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
