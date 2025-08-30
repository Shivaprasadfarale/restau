'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Trash2 } from 'lucide-react';
import ImageUpload from '@/components/ui/image-upload';

interface MenuItem {
  _id?: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image?: string;
  availability: boolean;
  preparationTime: number;
  tags: string[];
  dietaryInfo: {
    isVeg: boolean;
    isVegan: boolean;
    isGlutenFree: boolean;
    allergens: string[];
  };
  badges: string[];
  modifiers: Modifier[];
  nutritionalInfo?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    fiber?: number;
    sugar?: number;
  };
}

interface Modifier {
  name: string;
  type: 'radio' | 'checkbox' | 'select';
  required: boolean;
  maxSelections?: number;
  options: ModifierOption[];
}

interface ModifierOption {
  name: string;
  price: number;
}

interface Category {
  _id: string;
  name: string;
}

interface EnhancedMenuItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: any) => void;
  item?: MenuItem | null;
  categories: Category[];
}

export function EnhancedMenuItemModal({ 
  isOpen, 
  onClose, 
  onSave, 
  item, 
  categories 
}: EnhancedMenuItemModalProps) {
  const [formData, setFormData] = useState<MenuItem>({
    name: '',
    description: '',
    price: 0,
    category: '',
    availability: true,
    preparationTime: 15,
    tags: [],
    dietaryInfo: {
      isVeg: false,
      isVegan: false,
      isGlutenFree: false,
      allergens: []
    },
    badges: [],
    modifiers: [],
    nutritionalInfo: {}
  });

  const [tagInput, setTagInput] = useState('');
  const [allergenInput, setAllergenInput] = useState('');
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'modifiers' | 'nutrition' | 'advanced'>('basic');

  const badgeOptions = ['bestseller', 'new', 'spicy', 'chef-special', 'healthy'];

  useEffect(() => {
    if (item) {
      setFormData({
        ...item,
        nutritionalInfo: item.nutritionalInfo || {}
      });
    } else {
      setFormData({
        name: '',
        description: '',
        price: 0,
        category: categories.length > 0 ? categories[0]?.name || '' : '',
        availability: true,
        preparationTime: 15,
        tags: [],
        dietaryInfo: {
          isVeg: false,
          isVegan: false,
          isGlutenFree: false,
          allergens: []
        },
        badges: [],
        modifiers: [],
        nutritionalInfo: {}
      });
    }
  }, [item, isOpen, categories]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      alert('Name is required');
      return;
    }
    
    if (!formData.description.trim()) {
      alert('Description is required');
      return;
    }
    
    if (formData.price <= 0) {
      alert('Price must be greater than 0');
      return;
    }
    
    if (!formData.category) {
      alert('Category is required');
      return;
    }

    onSave(formData);
  };

  const handleImageUpload = (result: { publicId: string; url: string }) => {
    setFormData(prev => ({ ...prev, image: result.url }));
    setImageUploadError(null);
  };

  const handleImageUploadError = (error: string) => {
    setImageUploadError(error);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput('');
    }
  };

  const removeTag = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter((_, i) => i !== index)
    }));
  };

  const addAllergen = () => {
    if (allergenInput.trim() && !formData.dietaryInfo.allergens.includes(allergenInput.trim())) {
      setFormData(prev => ({
        ...prev,
        dietaryInfo: {
          ...prev.dietaryInfo,
          allergens: [...prev.dietaryInfo.allergens, allergenInput.trim()]
        }
      }));
      setAllergenInput('');
    }
  };

  const removeAllergen = (index: number) => {
    setFormData(prev => ({
      ...prev,
      dietaryInfo: {
        ...prev.dietaryInfo,
        allergens: prev.dietaryInfo.allergens.filter((_, i) => i !== index)
      }
    }));
  };

  const toggleBadge = (badge: string) => {
    setFormData(prev => ({
      ...prev,
      badges: prev.badges.includes(badge)
        ? prev.badges.filter(b => b !== badge)
        : [...prev.badges, badge]
    }));
  };

  const addModifier = () => {
    setFormData(prev => ({
      ...prev,
      modifiers: [...prev.modifiers, {
        name: '',
        type: 'radio',
        required: false,
        options: [{ name: '', price: 0 }]
      }]
    }));
  };

  const updateModifier = (index: number, modifier: Modifier) => {
    setFormData(prev => ({
      ...prev,
      modifiers: prev.modifiers.map((m, i) => i === index ? modifier : m)
    }));
  };

  const removeModifier = (index: number) => {
    setFormData(prev => ({
      ...prev,
      modifiers: prev.modifiers.filter((_, i) => i !== index)
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">
            {item ? 'Edit Menu Item' : 'Add Menu Item'}
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="border-b">
          <div className="flex">
            {[
              { id: 'basic', label: 'Basic Info' },
              { id: 'modifiers', label: 'Modifiers' },
              { id: 'nutrition', label: 'Nutrition' },
              { id: 'advanced', label: 'Advanced' }
            ].map((tab) => (
              <button
                key={tab.id}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
                onClick={() => setActiveTab(tab.id as any)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {activeTab === 'basic' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="price">Price (₹) *</Label>
                  <Input
                    id="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={(e) => setFormData(prev => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <textarea
                  id="description"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category._id} value={category.name}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="preparationTime">Preparation Time (minutes) *</Label>
                  <Input
                    id="preparationTime"
                    type="number"
                    min="1"
                    max="180"
                    value={formData.preparationTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, preparationTime: parseInt(e.target.value) || 15 }))}
                    required
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div>
                <Label>Image</Label>
                <div className="mt-2">
                  {formData.image ? (
                    <div className="space-y-4">
                      <div className="relative inline-block">
                        <img
                          src={formData.image}
                          alt="Menu item"
                          className="w-32 h-32 object-cover rounded-lg"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="absolute -top-2 -right-2"
                          onClick={() => setFormData(prev => ({ ...prev, image: undefined }))}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <ImageUpload
                        onUploadComplete={handleImageUpload}
                        onUploadError={handleImageUploadError}
                        options={{
                          folder: 'menu-items',
                          width: 800,
                          height: 600,
                          quality: 85
                        }}
                        multiple={false}
                        showPreview={false}
                        className="max-w-md"
                      />
                    </div>
                  ) : (
                    <div>
                      <ImageUpload
                        onUploadComplete={handleImageUpload}
                        onUploadError={handleImageUploadError}
                        options={{
                          folder: 'menu-items',
                          width: 800,
                          height: 600,
                          quality: 85
                        }}
                        multiple={false}
                        showPreview={true}
                        className="max-w-md"
                      />
                      {imageUploadError && (
                        <div className="mt-2 text-sm text-red-600">
                          {imageUploadError}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div>
                <Label>Tags</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                  />
                  <Button type="button" onClick={addTag}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.tags.map((tag, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(index)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Badges */}
              <div>
                <Label>Badges</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {badgeOptions.map((badge) => (
                    <Button
                      key={badge}
                      type="button"
                      variant={formData.badges.includes(badge) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleBadge(badge)}
                    >
                      {badge}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Availability */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="availability"
                  checked={formData.availability}
                  onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.checked }))}
                />
                <Label htmlFor="availability">Available</Label>
              </div>
            </div>
          )}

          {activeTab === 'modifiers' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Modifiers</h3>
                <Button type="button" onClick={addModifier}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Modifier
                </Button>
              </div>

              {formData.modifiers.map((modifier, index) => (
                <ModifierEditor
                  key={index}
                  modifier={modifier}
                  onChange={(updatedModifier) => updateModifier(index, updatedModifier)}
                  onRemove={() => removeModifier(index)}
                />
              ))}

              {formData.modifiers.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No modifiers added yet. Click "Add Modifier" to get started.
                </div>
              )}
            </div>
          )}

          {activeTab === 'nutrition' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium">Nutritional Information</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="calories">Calories</Label>
                  <Input
                    id="calories"
                    type="number"
                    min="0"
                    value={formData.nutritionalInfo?.calories || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        calories: e.target.value ? parseInt(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="protein">Protein (g)</Label>
                  <Input
                    id="protein"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionalInfo?.protein || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        protein: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="carbs">Carbs (g)</Label>
                  <Input
                    id="carbs"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionalInfo?.carbs || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        carbs: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="fat">Fat (g)</Label>
                  <Input
                    id="fat"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionalInfo?.fat || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        fat: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="fiber">Fiber (g)</Label>
                  <Input
                    id="fiber"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionalInfo?.fiber || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        fiber: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>

                <div>
                  <Label htmlFor="sugar">Sugar (g)</Label>
                  <Input
                    id="sugar"
                    type="number"
                    min="0"
                    step="0.1"
                    value={formData.nutritionalInfo?.sugar || ''}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      nutritionalInfo: {
                        ...prev.nutritionalInfo,
                        sugar: e.target.value ? parseFloat(e.target.value) : undefined
                      }
                    }))}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'advanced' && (
            <div className="space-y-6">
              <h3 className="text-lg font-medium">Dietary Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isVeg"
                    checked={formData.dietaryInfo.isVeg}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      dietaryInfo: { ...prev.dietaryInfo, isVeg: e.target.checked }
                    }))}
                  />
                  <Label htmlFor="isVeg">Vegetarian</Label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isVegan"
                    checked={formData.dietaryInfo.isVegan}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      dietaryInfo: { ...prev.dietaryInfo, isVegan: e.target.checked }
                    }))}
                  />
                  <Label htmlFor="isVegan">Vegan</Label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isGlutenFree"
                    checked={formData.dietaryInfo.isGlutenFree}
                    onChange={(e) => setFormData(prev => ({
                      ...prev,
                      dietaryInfo: { ...prev.dietaryInfo, isGlutenFree: e.target.checked }
                    }))}
                  />
                  <Label htmlFor="isGlutenFree">Gluten Free</Label>
                </div>
              </div>

              {/* Allergens */}
              <div>
                <Label>Allergens</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    value={allergenInput}
                    onChange={(e) => setAllergenInput(e.target.value)}
                    placeholder="Add allergen"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addAllergen())}
                  />
                  <Button type="button" onClick={addAllergen}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.dietaryInfo.allergens.map((allergen, index) => (
                    <Badge key={index} variant="destructive" className="flex items-center gap-1">
                      {allergen}
                      <button
                        type="button"
                        onClick={() => removeAllergen(index)}
                        className="text-white hover:text-gray-200"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-6 border-t">
            <Button type="submit" className="flex-1">
              {item ? 'Update Item' : 'Add Item'}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modifier Editor Component
function ModifierEditor({ 
  modifier, 
  onChange, 
  onRemove 
}: { 
  modifier: Modifier; 
  onChange: (modifier: Modifier) => void; 
  onRemove: () => void; 
}) {
  const addOption = () => {
    onChange({
      ...modifier,
      options: [...modifier.options, { name: '', price: 0 }]
    });
  };

  const updateOption = (index: number, option: ModifierOption) => {
    onChange({
      ...modifier,
      options: modifier.options.map((opt, i) => i === index ? option : opt)
    });
  };

  const removeOption = (index: number) => {
    onChange({
      ...modifier,
      options: modifier.options.filter((_, i) => i !== index)
    });
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Modifier</CardTitle>
          <Button variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Name</Label>
            <Input
              value={modifier.name}
              onChange={(e) => onChange({ ...modifier, name: e.target.value })}
              placeholder="e.g., Size, Spice Level"
            />
          </div>

          <div>
            <Label>Type</Label>
            <Select
              value={modifier.type}
              onValueChange={(value: 'radio' | 'checkbox' | 'select') => 
                onChange({ ...modifier, type: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="radio">Single Choice (Radio)</SelectItem>
                <SelectItem value="checkbox">Multiple Choice (Checkbox)</SelectItem>
                <SelectItem value="select">Dropdown (Select)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`required-${modifier.name}`}
              checked={modifier.required}
              onChange={(e) => onChange({ ...modifier, required: e.target.checked })}
            />
            <Label htmlFor={`required-${modifier.name}`}>Required</Label>
          </div>

          {modifier.type === 'checkbox' && (
            <div className="flex items-center gap-2">
              <Label>Max Selections:</Label>
              <Input
                type="number"
                min="1"
                className="w-20"
                value={modifier.maxSelections || ''}
                onChange={(e) => onChange({ 
                  ...modifier, 
                  maxSelections: e.target.value ? parseInt(e.target.value) : undefined 
                })}
              />
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <Label>Options</Label>
            <Button type="button" size="sm" onClick={addOption}>
              <Plus className="h-4 w-4 mr-1" />
              Add Option
            </Button>
          </div>

          <div className="space-y-2">
            {modifier.options.map((option, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  placeholder="Option name"
                  value={option.name}
                  onChange={(e) => updateOption(index, { ...option, name: e.target.value })}
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Price"
                  className="w-24"
                  value={option.price}
                  onChange={(e) => updateOption(index, { ...option, price: parseFloat(e.target.value) || 0 })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeOption(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}