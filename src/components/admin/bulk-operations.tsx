'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';

interface Category {
  _id: string;
  name: string;
}

interface BulkOperationsProps {
  isOpen: boolean;
  onClose: () => void;
  selectedItems: string[];
  onOperation: (action: string, value?: any) => Promise<void>;
  categories: Category[];
}

export function BulkOperations({ 
  isOpen, 
  onClose, 
  selectedItems, 
  onOperation,
  categories 
}: BulkOperationsProps) {
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [actionValue, setActionValue] = useState<string>('');
  const [dryRunResults, setDryRunResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const actions = [
    { id: 'enable', label: 'Enable Items', requiresValue: false },
    { id: 'disable', label: 'Disable Items', requiresValue: false },
    { id: 'delete', label: 'Delete Items', requiresValue: false },
    { id: 'update_price', label: 'Update Price', requiresValue: true, valueType: 'number' },
    { id: 'update_preparation_time', label: 'Update Preparation Time', requiresValue: true, valueType: 'number' },
    { id: 'update_category', label: 'Change Category', requiresValue: true, valueType: 'category' }
  ];

  const selectedActionData = actions.find(action => action.id === selectedAction);

  const handleDryRun = async () => {
    if (!selectedAction) {
      alert('Please select an action');
      return;
    }

    if (selectedActionData?.requiresValue && !actionValue) {
      alert('Please provide a value for this action');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/menu/items/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('adminToken')}`
        },
        body: JSON.stringify({
          itemIds: selectedItems,
          action: selectedAction,
          value: selectedActionData?.valueType === 'number' ? parseFloat(actionValue) : actionValue,
          dryRun: true
        })
      });

      if (response.ok) {
        const data = await response.json();
        setDryRunResults(data.data.results);
      } else {
        const error = await response.json();
        alert(error.error?.message || 'Dry run failed');
      }
    } catch (error) {
      console.error('Dry run failed:', error);
      alert('Dry run failed');
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!selectedAction) {
      alert('Please select an action');
      return;
    }

    if (selectedActionData?.requiresValue && !actionValue) {
      alert('Please provide a value for this action');
      return;
    }

    const confirmMessage = selectedAction === 'delete' 
      ? `Are you sure you want to DELETE ${selectedItems.length} items? This action cannot be undone.`
      : `Are you sure you want to ${selectedActionData?.label.toLowerCase()} for ${selectedItems.length} items?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setLoading(true);
    try {
      await onOperation(
        selectedAction, 
        selectedActionData?.valueType === 'number' ? parseFloat(actionValue) : actionValue
      );
      onClose();
    } catch (error) {
      console.error('Operation failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedAction('');
    setActionValue('');
    setDryRunResults(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold">Bulk Operations</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Selection Summary */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-lg px-3 py-1">
                  {selectedItems.length} items selected
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Action Selection */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="action">Select Action</Label>
              <Select value={selectedAction} onValueChange={setSelectedAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an action" />
                </SelectTrigger>
                <SelectContent>
                  {actions.map((action) => (
                    <SelectItem key={action.id} value={action.id}>
                      {action.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action Value Input */}
            {selectedActionData?.requiresValue && (
              <div>
                <Label htmlFor="actionValue">
                  {selectedActionData.valueType === 'number' ? 'Value' : 'New Category'}
                </Label>
                
                {selectedActionData.valueType === 'category' ? (
                  <Select value={actionValue} onValueChange={setActionValue}>
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
                ) : (
                  <Input
                    id="actionValue"
                    type="number"
                    step={selectedAction === 'update_price' ? '0.01' : '1'}
                    min={selectedAction === 'update_preparation_time' ? '1' : '0'}
                    max={selectedAction === 'update_preparation_time' ? '180' : undefined}
                    value={actionValue}
                    onChange={(e) => setActionValue(e.target.value)}
                    placeholder={
                      selectedAction === 'update_price' ? 'Enter new price' :
                      selectedAction === 'update_preparation_time' ? 'Enter preparation time (minutes)' :
                      'Enter value'
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* Dry Run Results */}
          {dryRunResults && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Dry Run Results
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">
                      {dryRunResults.success}
                    </div>
                    <div className="text-sm text-green-700">Items to be updated</div>
                  </div>
                  
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {dryRunResults.failed}
                    </div>
                    <div className="text-sm text-red-700">Items that will fail</div>
                  </div>
                </div>

                {dryRunResults.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium text-red-600">Errors:</h4>
                    {dryRunResults.errors.map((error: any, index: number) => (
                      <div key={index} className="p-3 bg-red-50 rounded border-l-4 border-red-400">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-700">{error.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {dryRunResults.affectedItems.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="font-medium">Preview of changes:</h4>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {dryRunResults.affectedItems.slice(0, 10).map((item: any, index: number) => (
                        <div key={index} className="text-sm p-2 bg-gray-50 rounded">
                          <span className="font-medium">{item.name}</span>
                          {item.currentValue !== undefined && item.newValue !== undefined && (
                            <span className="text-gray-600 ml-2">
                              {item.currentValue} → {item.newValue}
                            </span>
                          )}
                        </div>
                      ))}
                      {dryRunResults.affectedItems.length > 10 && (
                        <div className="text-sm text-gray-500 text-center">
                          ... and {dryRunResults.affectedItems.length - 10} more items
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleDryRun}
              disabled={!selectedAction || loading}
              className="flex-1"
            >
              {loading ? 'Running...' : 'Preview Changes'}
            </Button>
            
            <Button
              onClick={handleExecute}
              disabled={!selectedAction || loading}
              variant={selectedAction === 'delete' ? 'destructive' : 'default'}
              className="flex-1"
            >
              {loading ? 'Executing...' : 'Execute'}
            </Button>
          </div>

          {/* Action Descriptions */}
          {selectedActionData && (
            <Card>
              <CardContent className="pt-4">
                <div className="text-sm text-gray-600">
                  {selectedAction === 'enable' && 'Make selected items available for ordering.'}
                  {selectedAction === 'disable' && 'Make selected items unavailable for ordering.'}
                  {selectedAction === 'delete' && 'Permanently delete selected items. This action cannot be undone.'}
                  {selectedAction === 'update_price' && 'Update the price for all selected items to the specified value.'}
                  {selectedAction === 'update_preparation_time' && 'Update the preparation time for all selected items.'}
                  {selectedAction === 'update_category' && 'Move all selected items to the specified category.'}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Warning for destructive actions */}
          {selectedAction === 'delete' && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Warning: This action is irreversible</span>
                </div>
                <p className="text-sm text-red-600 mt-1">
                  Deleted items cannot be recovered. Make sure you have backups if needed.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}