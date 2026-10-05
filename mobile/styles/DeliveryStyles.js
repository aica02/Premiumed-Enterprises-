import { StyleSheet } from 'react-native';

export const deliveryStyles = StyleSheet.create({
  container: {
    top: '2%', 
    flex: 1, 
    backgroundColor: '#F5F5F5',
    marginHorizontal: 10,
  },
  headerRow: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    marginVertical: '2%', 
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', marginLeft: 10,},
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: '2%'
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 15,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 45,
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 20,
  },
  searchInput: { flex: 1, paddingHorizontal: 10 },
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: 10,
    marginBottom: 15,
    borderRadius: 12,
    padding: 15,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  orderID: { fontWeight: 'bold', fontSize: 16 },
  pendingBadge: {
    backgroundColor: '#FDE68A', // Light yellow badge
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pendingText: { color: '#92400E', fontSize: 12, fontWeight: 'bold' },
  clientName: { color: '#4B5563', marginBottom: 5 },
  addressContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  addressText: { color: '#6B7280', fontSize: 13, marginLeft: 5 },
  viewDetailsBtn: {
    backgroundColor: '#D4AF37', // Gold button
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: { color: '#FFF', fontWeight: 'bold' },
});