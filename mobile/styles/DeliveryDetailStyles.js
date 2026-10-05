import { StyleSheet } from 'react-native';

export const detailStyles = StyleSheet.create({
  container: {
    flex: 1, 
    backgroundColor: '#F5F5F5',
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 20, 
    backgroundColor: '#FFF' 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 15 },
  card: {
    backgroundColor: '#FFF',
    margin: 10,
    borderRadius: 10,
    padding: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  cardTitle: { 
    fontSize: 16, 
    fontWeight: 'bold', 
    marginBottom: 5,
    textTransform: 'uppercase'
  },
  goldDivider: { 
    height: 2, 
    backgroundColor: '#D4AF37', 
    width: '100%' 
    // marginBottom: 10 
  },
  label: { color: '#666', fontSize: 13, marginTop: 10 },
  value: { fontWeight: 'bold', fontSize: 15, color: '#333' },
  orderIdValue: { color: '#D4AF37', fontSize: 18, fontWeight: 'bold' },
  
  // Medical Supplies Table
  supplyRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 10, 
    borderBottomWidth: 1, 
    borderBottomColor: '#EEE' 
  },
  supplyName: { fontWeight: 'bold', fontSize: 14 },
  supplyDesc: { fontSize: 11, color: '#777' },
  supplyQty: { textAlign: 'center' },
  qtyText: { fontWeight: 'bold', fontSize: 16 },
  qtySubText: { fontSize: 10, color: '#777' },
  supplyPrice: { fontWeight: 'bold', fontSize: 15 },

  // Status Section
  dropdown: {
    borderWidth: 1,
    borderColor: '#000',
    borderRadius: 5,
    padding: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10
  },
  updateBtn: {
    backgroundColor: '#D4AF37',
    padding: 18,
    borderRadius: 10,
    marginTop: 20,
    alignItems: 'center'
  },
  updateBtnText: { 
    color: '#FFF', fontWeight: 'bold', fontSize: 16 
  },
});