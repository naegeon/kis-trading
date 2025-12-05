'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast'; // Corrected path
import type { Order } from '@/types/order';

interface OrderDetailProps {
  order: Order | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onOrderCancelled: () => void; // Callback to refresh the list
}

export function OrderDetail({ order, isOpen, onOpenChange, onOrderCancelled }: OrderDetailProps) {
  const [isCancelling, setIsCancelling] = useState(false);
  const { toast } = useToast();

  const handleCancelOrder = async () => {
    if (!order) return;

    setIsCancelling(true);
    try {
      const response = await fetch(`/api/orders/${order.id}/cancel`, {
        method: 'POST',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to cancel order.');
      }

      toast({
        title: 'Success',
        description: 'Order has been cancelled successfully.',
      });
      onOrderCancelled(); // Refresh the orders list
      onOpenChange(false); // Close the modal
    } catch (error) {
      console.error('Error cancelling order:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unknown error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsCancelling(false);
    }
  };

  if (!order) return null;

  const isCancelable = order.status === 'SUBMITTED' || order.status === 'PARTIALLY_FILLED';

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            Detailed information for order ID: {order.id}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Status</span>
            <div className="col-span-2">
              <Badge>{order.status}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Strategy</span>
            <span className="col-span-2">{order.strategyId}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Symbol</span>
            <span className="col-span-2">{order.symbol}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Side / Type</span>
            <span className="col-span-2">{order.side} / {order.orderType}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Quantity</span>
            <span className="col-span-2">{order.quantity}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Price</span>
            <span className="col-span-2">{order.price ? `$${order.price}` : 'N/A'}</span>
          </div>
          <div className="grid grid-cols-3 items-center gap-4">
            <span className="text-muted-foreground">Submitted At</span>
            <span className="col-span-2">{order.submittedAt ? new Date(order.submittedAt).toLocaleString('ko-KR') : 'N/A'}</span>
          </div>
          {order.errorMessage && (
            <div className="grid grid-cols-3 items-center gap-4">
              <span className="text-muted-foreground text-destructive">Error</span>
              <span className="col-span-2 text-destructive">{order.errorMessage}</span>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={handleCancelOrder}
            disabled={!isCancelable || isCancelling}
          >
            {isCancelling ? 'Cancelling...' : 'Cancel Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
