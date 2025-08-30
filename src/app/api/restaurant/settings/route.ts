import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import { Restaurant } from '@/models/Restaurant';
import { adminMiddleware } from '@/lib/auth/admin-middleware';

export async function GET(request: NextRequest) {
  try {
    const authResult = await adminMiddleware(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    await connectToDatabase();
    const restaurant = await Restaurant.findOne({ ownerId: authResult.user.id });
    
    if (!restaurant) {
      return NextResponse.json({ error: 'Restaurant not found' }, { status: 404 });
    }

    return NextResponse.json({ restaurant });
  } catch (error) {
    console.error('Error fetching restaurant settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authResult = await adminMiddleware(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: 401 });
    }

    const body = await request.json();
    const { name, description, address, phone, email, operatingHours, deliveryRadius, taxRate, deliveryFee, minimumOrder } = body;

    await connectToDatabase();
    const restaurant = await Restaurant.findOneAndUpdate(
      { ownerId: authResult.user.id },
      {
        name,
        description,
        address,
        phone,
        email,
        operatingHours,
        deliveryRadius,
        taxRate,
        deliveryFee,
        minimumOrder,
        updatedAt: new Date()
      },
      { new: true, upsert: true }
    );

    return NextResponse.json({ restaurant });
  } catch (error) {
    console.error('Error updating restaurant settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}