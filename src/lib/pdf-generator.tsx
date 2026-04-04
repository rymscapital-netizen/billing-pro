import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer"
import React from "react"

// ── 型定義 ─────────────────────────────────────────────────
export interface InvoicePdfData {
  invoiceNumber: string
  issueDate:     string
  dueDate:       string
  subject:       string
  subtotal:      number
  tax:           number
  amount:        number
  notes?:        string
  // 請求先
  clientName:    string
  // 発行元（自社）
  issuerName:    string
  issuerAddress: string
  issuerTel:     string
  issuerEmail:   string
  // 明細（任意）
  lineItems?: { description: string; qty: number; unitPrice: number; amount: number }[]
}

// ── スタイル ───────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily:  "Helvetica",
    fontSize:    10,
    color:       "#1a2a4a",
    padding:     48,
    backgroundColor: "#ffffff",
  },
  // ヘッダー
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems:     "flex-start",
    marginBottom:   32,
  },
  logo: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color:  "#0f1f3d",
    letterSpacing: 0.5,
  },
  logoGold: {
    color: "#c49828",
  },
  issuerBlock: {
    textAlign: "right",
    lineHeight: 1.6,
    color: "#5a6a8a",
    fontSize: 9,
  },
  // タイトル
  title: {
    fontSize:     22,
    fontFamily:   "Helvetica-Bold",
    color:        "#0f1f3d",
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  invoiceNum: {
    fontSize: 11,
    color:    "#8a9ab8",
    marginBottom: 24,
  },
  // 区切り線
  divider: {
    borderTopWidth: 1,
    borderTopColor: "#e4eaf4",
    marginVertical: 16,
  },
  goldDivider: {
    borderTopWidth:  2,
    borderTopColor:  "#c49828",
    marginVertical:  16,
    width: 40,
  },
  // 2カラムレイアウト
  row2: {
    flexDirection:  "row",
    justifyContent: "space-between",
    marginBottom:   20,
  },
  col: {
    flex: 1,
  },
  // ラベル・値
  label: {
    fontSize:    8,
    color:       "#8a9ab8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  value: {
    fontSize:   11,
    color:      "#0f1f3d",
    fontFamily: "Helvetica-Bold",
  },
  valueLight: {
    fontSize: 10,
    color:    "#3a4e6e",
  },
  // 明細テーブル
  table: {
    marginTop: 16,
  },
  tableHead: {
    flexDirection:   "row",
    backgroundColor: "#f2f5fa",
    padding:         "8 10",
    borderRadius:    4,
  },
  tableHeadText: {
    fontSize:  8,
    color:     "#8a9ab8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection:  "row",
    padding:        "9 10",
    borderBottomWidth: 1,
    borderBottomColor: "#e4eaf4",
  },
  tableRowAlt: {
    backgroundColor: "#f9fbfe",
  },
  tableCell: {
    fontSize: 10,
    color:    "#3a4e6e",
  },
  tableCellRight: {
    fontSize:  10,
    color:     "#3a4e6e",
    textAlign: "right",
  },
  // 合計ブロック
  totalBlock: {
    marginTop: 20,
    alignItems: "flex-end",
  },
  totalRow: {
    flexDirection:  "row",
    justifyContent: "flex-end",
    gap:            80,
    marginBottom:   6,
  },
  totalLabel: {
    fontSize: 10,
    color:    "#8a9ab8",
    width:    80,
    textAlign: "right",
  },
  totalValue: {
    fontSize:   10,
    color:      "#3a4e6e",
    width:      100,
    textAlign:  "right",
    fontFamily: "Helvetica",
  },
  grandTotalRow: {
    flexDirection:  "row",
    justifyContent: "flex-end",
    alignItems:     "baseline",
    gap:            80,
    marginTop:      8,
    paddingTop:     10,
    borderTopWidth: 2,
    borderTopColor: "#0f1f3d",
  },
  grandTotalLabel: {
    fontSize:   12,
    color:      "#0f1f3d",
    fontFamily: "Helvetica-Bold",
    width:      80,
    textAlign:  "right",
  },
  grandTotalValue: {
    fontSize:   16,
    color:      "#0f1f3d",
    fontFamily: "Helvetica-Bold",
    width:      100,
    textAlign:  "right",
  },
  // 備考
  notesBlock: {
    marginTop:       24,
    padding:         "12 14",
    backgroundColor: "#f2f5fa",
    borderRadius:    4,
    borderLeftWidth: 3,
    borderLeftColor: "#c49828",
  },
  notesLabel: {
    fontSize:    8,
    color:       "#8a9ab8",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "Helvetica-Bold",
  },
  notesText: {
    fontSize: 10,
    color:    "#3a4e6e",
    lineHeight: 1.6,
  },
  // フッター
  footer: {
    position:   "absolute",
    bottom:     32,
    left:       48,
    right:      48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems:    "flex-end",
  },
  footerText: {
    fontSize: 8,
    color:    "#c0cee4",
  },
  stampBox: {
    width:        60,
    height:       60,
    borderWidth:  1,
    borderColor:  "#c0cee4",
    borderRadius: 30,
    alignItems:   "center",
    justifyContent: "center",
  },
  stampText: {
    fontSize: 7,
    color:    "#c0cee4",
  },
})

// ── コンポーネント ─────────────────────────────────────────
function InvoicePdf({ data }: { data: InvoicePdfData }) {
  const yen = (n: number) => `¥${n.toLocaleString("en-US")}`
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    })

  // 明細がなければデフォルト1行
  const items = data.lineItems ?? [
    {
      description: data.subject,
      qty:         1,
      unitPrice:   data.subtotal,
      amount:      data.subtotal,
    },
  ]

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ── ヘッダー ── */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.logo}>
              Billing<Text style={S.logoGold}>Pro</Text>
            </Text>
          </View>
          <View style={S.issuerBlock}>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 10, color: "#0f1f3d", marginBottom: 4 }}>
              {data.issuerName}
            </Text>
            <Text>{data.issuerAddress}</Text>
            <Text>TEL: {data.issuerTel}</Text>
            <Text>{data.issuerEmail}</Text>
          </View>
        </View>

        {/* ── タイトル ── */}
        <Text style={S.title}>請求書</Text>
        <Text style={S.invoiceNum}>{data.invoiceNumber}</Text>

        <View style={S.goldDivider} />

        {/* ── 請求先・日付 ── */}
        <View style={S.row2}>
          <View style={S.col}>
            <Text style={S.label}>請求先</Text>
            <Text style={S.value}>{data.clientName} 御中</Text>
          </View>
          <View style={[S.col, { alignItems: "flex-end" }]}>
            <View style={{ marginBottom: 10 }}>
              <Text style={S.label}>請求日</Text>
              <Text style={S.valueLight}>{fmtDate(data.issueDate)}</Text>
            </View>
            <View>
              <Text style={S.label}>お支払期限</Text>
              <Text style={[S.valueLight, { color: "#c49828", fontFamily: "Helvetica-Bold" }]}>
                {fmtDate(data.dueDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── 件名 ── */}
        <View style={{ marginBottom: 20 }}>
          <Text style={S.label}>件名</Text>
          <Text style={S.valueLight}>{data.subject}</Text>
        </View>

        <View style={S.divider} />

        {/* ── 明細テーブル ── */}
        <View style={S.table}>
          <View style={S.tableHead}>
            <Text style={[S.tableHeadText, { flex: 4 }]}>品目・内容</Text>
            <Text style={[S.tableHeadText, { flex: 1, textAlign: "right" }]}>数量</Text>
            <Text style={[S.tableHeadText, { flex: 2, textAlign: "right" }]}>単価</Text>
            <Text style={[S.tableHeadText, { flex: 2, textAlign: "right" }]}>金額</Text>
          </View>
          {items.map((item, i) => (
            <View
              key={i}
              style={[S.tableRow, i % 2 === 1 ? S.tableRowAlt : {}]}
            >
              <Text style={[S.tableCell, { flex: 4 }]}>{item.description}</Text>
              <Text style={[S.tableCellRight, { flex: 1 }]}>{item.qty}</Text>
              <Text style={[S.tableCellRight, { flex: 2 }]}>{yen(item.unitPrice)}</Text>
              <Text style={[S.tableCellRight, { flex: 2 }]}>{yen(item.amount)}</Text>
            </View>
          ))}
        </View>

        {/* ── 合計 ── */}
        <View style={S.totalBlock}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>小計</Text>
            <Text style={S.totalValue}>{yen(data.subtotal)}</Text>
          </View>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>消費税（10%）</Text>
            <Text style={S.totalValue}>{yen(data.tax)}</Text>
          </View>
          <View style={S.grandTotalRow}>
            <Text style={S.grandTotalLabel}>ご請求金額</Text>
            <Text style={S.grandTotalValue}>{yen(data.amount)}</Text>
          </View>
        </View>

        {/* ── 備考 ── */}
        {data.notes && (
          <View style={S.notesBlock}>
            <Text style={S.notesLabel}>備考</Text>
            <Text style={S.notesText}>{data.notes}</Text>
          </View>
        )}

        {/* ── フッター ── */}
        <View style={S.footer}>
          <Text style={S.footerText}>
            本請求書に関するお問い合わせは {data.issuerEmail} までご連絡ください
          </Text>
          <View style={S.stampBox}>
            <Text style={S.stampText}>印鑑</Text>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ── PDF バイナリ生成 ───────────────────────────────────────
export async function generateInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePdf data={data} />)
  return Buffer.from(buffer)
}
