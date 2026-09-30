// Download tasks as JSON, CSV or PDF (all in the browser).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const COLUMNS = [
  ["Date", (t) => t.date_logged || ""],
  ["Title", (t) => t.title || ""],
  ["Status", (t) => t.status || ""],
  ["Tags", (t) => (t.tags || []).map((g) => g.name).join(", ")],
  ["Description", (t) => t.description || ""],
];

const download = (blob, filename) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

export const exportJSON = (data, filename) =>
  download(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${filename}.json`);

// Quotes every cell so commas, quotes and new lines survive Excel.
export const exportCSV = (tasks, filename) => {
  const cell = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [
    COLUMNS.map(([h]) => cell(h)).join(","),
    ...tasks.map((t) => COLUMNS.map(([, get]) => cell(get(t))).join(",")),
  ];
  // BOM so Excel opens UTF-8 (Urdu, emoji...) correctly
  download(new Blob(["﻿" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" }), `${filename}.csv`);
};

export const exportPDF = (tasks, filename, title = "Tasks", summaryLines = []) => {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(110);
  let y = 25;
  [`Generated ${new Date().toLocaleString()}`, ...summaryLines].forEach((line) => {
    doc.splitTextToSize(line, 180).forEach((l) => {
      doc.text(l, 14, y);
      y += 5;
    });
  });

  autoTable(doc, {
    startY: y + 3,
    head: [COLUMNS.map(([h]) => h)],
    body: tasks.map((t) => COLUMNS.map(([, get]) => get(t))),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [17, 24, 39] },
    columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 18 }, 4: { cellWidth: 55 } },
  });

  doc.save(`${filename}.pdf`);
};
