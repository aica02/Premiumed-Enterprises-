// Unit labels for order quantities ("1 Gallon", "5 Gallons", "3 Pieces").
// Orders store the product's unit (Gallon, Bottles, Pack, Piece, Sack, Bag).

export const pluralizeUnit = (label) => {
  const text = String(label || '').trim();
  if (!text) return text;
  const lower = text.toLowerCase();
  if (lower.endsWith('s')) return text;
  if (/(x|z|ch|sh)$/.test(lower)) return `${text}es`;
  return `${text}s`;
};

export const unitLabel = (quantity, unitType) => {
  const unit = String(unitType || '').trim() || 'Piece';
  return Number(quantity) === 1 ? unit.replace(/s$/i, '') || unit : pluralizeUnit(unit);
};
