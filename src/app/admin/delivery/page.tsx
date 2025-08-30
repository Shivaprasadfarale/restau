'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Truck, 
  MapPin, 
  Clock, 
  User, 
  Phone,
  Navigation,
  CheckCircle,
  AlertCircle
} from 'lucide-react';

interface DeliveryPerson {
  id: string;
  name: string;
  phone: string;
  status: 'available' | 'busy' | 'offline';
  currentOrders: number;
  totalDeliveries: number;
  rating: number;
}

interface DeliveryOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  address: string;
  items: Array<{ name: string; quantity: number }>;
  total: number;
  status: 'ready' | 'assigned' | 'picked_up' | 'delivered';
  assignedTo?: string;
  estimatedDelivery: string;
  distance: number;
  createdAt: string;
}

export default function DeliveryPage() {
  const [deliveryPersons, setDeliveryPersons] = useState<DeliveryPerson[]>([]);
  const [deliveryOrders, setDeliveryOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeliveryData();
  }, []);

  const fetchDeliveryData = async () => {
    try {
      // Mock data for now - replace with actual API calls
      const mockDeliveryPersons: DeliveryPerson[] = [
        {
          id: '1',
          name: 'Mike Johnson',
          phone: '+1 (555) 111-2222',
          status: 'available',
          currentOrders: 0,
          totalDeliveries: 145,
          rating: 4.8,
        },
        {
          id: '2',
          name: 'Sarah Wilson',
          phone: '+1 (555) 333-4444',
          status: 'busy',
          currentOrders: 2,
          totalDeliveries: 203,
          rating: 4.9,
        },
        {
          id: '3',
          name: 'David Brown',
          phone: '+1 (555) 555-6666',
          status: 'available',
          currentOrders: 1,
          totalDeliveries: 89,
          rating: 4.6,
        },
      ];

      const mockDeliveryOrders: DeliveryOrder[] = [
        {
          id: '1',
          customerName: 'John Doe',
          customerPhone: '+1 (555) 123-4567',
          address: '123 Main St, City, State 12345',
          items: [
            { name: 'Margherita Pizza', quantity: 1 },
            { name: 'Coke', quantity: 2 }
          ],
          total: 24.97,
          status: 'ready',
          estimatedDelivery: new Date(Date.now() + 30 * 60000).toISOString(),
          distance: 2.5,
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          customerName: 'Jane Smith',
          customerPhone: '+1 (555) 987-6543',
          address: '456 Oak Ave, City, State 12345',
          items: [
            { name: 'Chicken Burger', quantity: 1 },
            { name: 'Fries', quantity: 1 }
          ],
          total: 20.98,
          status: 'assigned',
          assignedTo: '2',
          estimatedDelivery: new Date(Date.now() + 20 * 60000).toISOString(),
          distance: 1.8,
          createdAt: new Date(Date.now() - 10 * 60000).toISOString(),
        },
        {
          id: '3',
          customerName: 'Bob Wilson',
          customerPhone: '+1 (555) 456-7890',
          address: '789 Pine St, City, State 12345',
          items: [
            { name: 'Caesar Salad', quantity: 1 }
          ],
          total: 12.99,
          status: 'picked_up',
          assignedTo: '3',
          estimatedDelivery: new Date(Date.now() + 15 * 60000).toISOString(),
          distance: 3.2,
          createdAt: new Date(Date.now() - 25 * 60000).toISOString(),
        },
      ];

      setDeliveryPersons(mockDeliveryPersons);
      setDeliveryOrders(mockDeliveryOrders);
    } catch (error) {
      console.error('Failed to fetch delivery data:', error);
    } finally {
      setLoading(false);
    }
  };

  const assignOrder = async (orderId: string, deliveryPersonId: string) => {
    try {
      setDeliveryOrders(orders =>
        orders.map(order =>
          order.id === orderId
            ? { ...order, status: 'assigned', assignedTo: deliveryPersonId }
            : order
        )
      );
      
      setDeliveryPersons(persons =>
        persons.map(person =>
          person.id === deliveryPersonId
            ? { ...person, currentOrders: person.currentOrders + 1 }
            : person
        )
      );
    } catch (error) {
      console.error('Failed to assign order:', error);
    }
  };

  const updateOrderStatus = async (orderId: string, newStatus: DeliveryOrder['status']) => {
    try {
      setDeliveryOrders(orders =>
        orders.map(order =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );
    } catch (error) {
      console.error('Failed to update order status:', error);
    }
  };

  const getStatusIcon = (status: DeliveryOrder['status']) => {
    switch (status) {
      case 'ready':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'assigned':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'picked_up':
        return <Truck className="h-4 w-4 text-orange-500" />;
      case 'delivered':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: DeliveryOrder['status']) => {
    switch (status) {
      case 'ready':
        return 'bg-yellow-100 text-yellow-800';
      case 'assigned':
        return 'bg-blue-100 text-blue-800';
      case 'picked_up':
        return 'bg-orange-100 text-orange-800';
      case 'delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPersonStatusColor = (status: DeliveryPerson['status']) => {
    switch (status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'busy':
        return 'bg-orange-100 text-orange-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Delivery Management</h1>
      </div>

      {/* Delivery Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Active Deliveries</p>
                <p className="text-2xl font-bold">
                  {deliveryOrders.filter(o => ['assigned', 'picked_up'].includes(o.status)).length}
                </p>
              </div>
              <Truck className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Available Drivers</p>
                <p className="text-2xl font-bold">
                  {deliveryPersons.filter(p => p.status === 'available').length}
                </p>
              </div>
              <User className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Orders</p>
                <p className="text-2xl font-bold">
                  {deliveryOrders.filter(o => o.status === 'ready').length}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Avg Delivery Time</p>
                <p className="text-2xl font-bold">28 min</p>
              </div>
              <Navigation className="h-8 w-8 text-purple-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Delivery Personnel */}
        <Card>
          <CardHeader>
            <CardTitle>Delivery Personnel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deliveryPersons.map((person) => (
              <div key={person.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <p className="font-medium">{person.name}</p>
                    <Badge className={getPersonStatusColor(person.status)}>
                      {person.status}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2 text-sm text-gray-600">
                    <Phone className="h-3 w-3" />
                    <span>{person.phone}</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {person.currentOrders} active • {person.totalDeliveries} total • ⭐ {person.rating}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Delivery Orders */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Delivery Orders</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {deliveryOrders.map((order) => (
                <div key={order.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(order.status)}
                      <Badge className={getStatusColor(order.status)}>
                        {order.status.replace('_', ' ')}
                      </Badge>
                      <span className="text-sm text-gray-500">#{order.id}</span>
                    </div>
                    <span className="text-sm font-medium">${order.total}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <User className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{order.customerName}</span>
                      <span className="text-sm text-gray-500">{order.customerPhone}</span>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span className="text-sm">{order.address}</span>
                      <span className="text-sm text-gray-500">({order.distance} km)</span>
                    </div>

                    <div className="text-sm text-gray-600">
                      Items: {order.items.map(item => `${item.quantity}x ${item.name}`).join(', ')}
                    </div>

                    <div className="flex items-center space-x-2 text-sm text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>ETA: {new Date(order.estimatedDelivery).toLocaleTimeString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    {order.assignedTo && (
                      <div className="text-sm">
                        <span className="text-gray-600">Assigned to: </span>
                        <span className="font-medium">
                          {deliveryPersons.find(p => p.id === order.assignedTo)?.name}
                        </span>
                      </div>
                    )}

                    <div className="flex gap-2">
                      {order.status === 'ready' && (
                        <Select onValueChange={(value) => assignOrder(order.id, value)}>
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Assign driver" />
                          </SelectTrigger>
                          <SelectContent>
                            {deliveryPersons
                              .filter(p => p.status === 'available')
                              .map(person => (
                                <SelectItem key={person.id} value={person.id}>
                                  {person.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      )}

                      {order.status === 'assigned' && (
                        <Button
                          size="sm"
                          onClick={() => updateOrderStatus(order.id, 'picked_up')}
                        >
                          Mark Picked Up
                        </Button>
                      )}

                      {order.status === 'picked_up' && (
                        <Button
                          size="sm"
                          onClick={() => updateOrderStatus(order.id, 'delivered')}
                        >
                          Mark Delivered
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}