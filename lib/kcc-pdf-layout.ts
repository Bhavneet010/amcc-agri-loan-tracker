/** Bottom edge of the two-column borrower and crop section, in A4 millimetres. */
export function topSectionBottom(tableEndY: number, hasTotalLand: boolean): number {
  return Math.max(hasTotalLand ? 93 : 91, tableEndY + 3);
}
