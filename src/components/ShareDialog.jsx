import { useEffect, useRef, useState } from 'react';

const QR_COLORS = { dark: '#0f1115', light: '#ffffff' };

/** The app's address without any query string or #hash. */
function appUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Modal with a QR code of the app's link, plus copy / native share / download.
 * The QR library is loaded only when the dialog first opens.
 */
export default function ShareDialog({ open, onClose }) {
  const dialogRef = useRef(null);
  const [url] = useState(appUrl);
  const [svg, setSvg] = useState('');
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator.share === 'function';

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open || svg) return;
    let cancelled = false;
    import('qrcode')
      .then((QR) =>
        QR.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: QR_COLORS }),
      )
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, svg, url]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: select the link text so it can be copied by hand.
      window.getSelection()?.selectAllChildren(dialogRef.current.querySelector('.share-url'));
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({
        title: "Rubik's Cube 3D",
        text: 'Try this 3D Rubik’s cube — shuffle it and solve it in your browser.',
        url,
      });
    } catch {
      // User cancelled the share sheet; nothing to do.
    }
  };

  const download = async () => {
    const QR = await import('qrcode');
    const dataUrl = await QR.toDataURL(url, { width: 1024, margin: 2, color: QR_COLORS });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = 'rubik-cube-qr.png';
    a.click();
  };

  return (
    <dialog
      ref={dialogRef}
      className="share-dialog"
      aria-labelledby="share-title"
      onClose={onClose}
      // Clicking the dimmed backdrop (the dialog element itself) closes it.
      onClick={(e) => e.target === dialogRef.current && onClose()}
    >
      <div className="share-body">
        <div className="share-head">
          <h2 id="share-title">Share this app</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z"
                fill="currentColor"
              />
            </svg>
          </button>
        </div>

        <p className="share-sub">Scan with a phone camera to open the cube.</p>

        <div
          className="qr"
          role="img"
          aria-label={`QR code for ${url}`}
          // Markup is generated locally by the qrcode library from our own URL.
          dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
        />

        <div className="share-url" title={url}>
          {url}
        </div>

        <div className="share-actions">
          <button className="primary" onClick={copy}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
          {canNativeShare && <button onClick={nativeShare}>Share…</button>}
          <button onClick={download}>Download QR</button>
        </div>
      </div>
    </dialog>
  );
}
