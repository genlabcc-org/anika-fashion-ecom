/**
 * Utilities for CSV export, IST date/time handling, formula injection protection,
 * and client-side file downloads for the Anika Admin panel.
 */

/**
 * Returns today's date in IST (Asia/Kolkata) as 'YYYY-MM-DD'.
 * @returns {string}
 */
export function getTodayISTStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Calculates start (from) and end (to) date strings (YYYY-MM-DD) in IST for presets.
 * @param {'today' | 'last_7_days' | 'last_30_days' | 'this_month' | 'all_time'} preset
 * @returns {{ from: string, to: string }}
 */
export function getPresetDates(preset) {
  const todayStr = getTodayISTStr();
  const [y, m, d] = todayStr.split('-').map(Number);

  switch (preset) {
    case 'today':
      return { from: todayStr, to: todayStr };

    case 'last_7_days': {
      // 7 calendar days inclusive (today and preceding 6 days)
      const target = new Date(Date.UTC(y, m - 1, d - 6));
      const fromStr = target.toISOString().split('T')[0];
      return { from: fromStr, to: todayStr };
    }

    case 'last_30_days': {
      // 30 calendar days inclusive
      const target = new Date(Date.UTC(y, m - 1, d - 29));
      const fromStr = target.toISOString().split('T')[0];
      return { from: fromStr, to: todayStr };
    }

    case 'this_month': {
      const fromStr = `${y}-${String(m).padStart(2, '0')}-01`;
      return { from: fromStr, to: todayStr };
    }

    case 'all_time':
    default:
      return { from: '', to: '' };
  }
}

/**
 * Formats a timestamp into IST (Asia/Kolkata) format "DD-MM-YYYY HH:mm".
 * @param {string|Date} dateInput
 * @returns {string}
 */
export function formatISTDateTime(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  let day = '', month = '', year = '', hour = '', minute = '';
  for (const part of parts) {
    if (part.type === 'day') day = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'year') year = part.value;
    else if (part.type === 'hour') hour = part.value;
    else if (part.type === 'minute') minute = part.value;
  }

  if (hour === '24') hour = '00';
  return `${day}-${month}-${year} ${hour}:${minute}`;
}

/**
 * Escapes a single cell value for Excel-compliant CSV.
 * Includes CSV formula injection protection for text fields starting with =, +, -, @, tab, or carriage return.
 * Numeric fields remain clean numbers so Excel can perform mathematical operations (like SUM).
 * 
 * @param {any} val
 * @param {boolean} [isNumeric=false]
 * @returns {string}
 */
export function escapeCsvField(val, isNumeric = false) {
  if (val === null || val === undefined) return '';

  if (isNumeric) {
    const num = Number(val);
    return isNaN(num) ? '0' : String(num);
  }

  let str = String(val);

  // CSV injection protection: prepend single quote if text starts with formula triggers
  const trimmed = str.trimStart();
  if (
    trimmed.startsWith('=') ||
    trimmed.startsWith('+') ||
    trimmed.startsWith('-') ||
    trimmed.startsWith('@') ||
    trimmed.startsWith('\t') ||
    trimmed.startsWith('\r')
  ) {
    str = `'${str}`;
  }

  // Double internal quotes and enclose in quotes if contains comma, quote, or newline
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Converts order export records into an Excel-friendly UTF-8 with BOM CSV string.
 * Columns: Order ID, Customer Name, Email ID, Price, Date & Time.
 * 
 * @param {Array<{ orderId: string, customerName: string, email: string, price: number, dateTime: string }>} rows
 * @returns {string}
 */
export function generateOrdersCsv(rows = []) {
  const headers = ['Order ID', 'Customer Name', 'Email ID', 'Price', 'Date & Time'];
  const headerLine = headers.map((h) => escapeCsvField(h)).join(',');

  const rowLines = rows.map((r) => [
    escapeCsvField(r.orderId),
    escapeCsvField(r.customerName),
    escapeCsvField(r.email),
    escapeCsvField(r.price, true),
    escapeCsvField(r.dateTime),
  ].join(','));

  // UTF-8 BOM prefix ensures non-English characters open properly in Excel
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}

/**
 * Determines the file name based on date selection.
 * Format: anika-orders-YYYY-MM-DD.csv (using export date or selected range).
 * 
 * @param {{ from?: string, to?: string }} options
 * @returns {string}
 */
export function getExportFilename({ from, to } = {}) {
  if (from && to) {
    return from === to ? `anika-orders-${from}.csv` : `anika-orders-${from}-to-${to}.csv`;
  }
  if (from) {
    return `anika-orders-from-${from}.csv`;
  }
  if (to) {
    return `anika-orders-to-${to}.csv`;
  }
  return `anika-orders-${getTodayISTStr()}.csv`;
}

/**
 * Triggers a client-side download of a CSV file using a Blob.
 * 
 * @param {string} csvContent
 * @param {string} filename
 */
export function downloadCsvFile(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
