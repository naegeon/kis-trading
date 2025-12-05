'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Bell, BellOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

export function PushNotificationToggle() {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupported, setIsSupported] = useState(true);

  const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    if (!session?.user?.id) {
      setIsLoading(false);
      return;
    }

    const checkSubscription = async (): Promise<void> => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setIsSupported(false);
        setIsLoading(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsEnabled(!!subscription);
      } catch (error) {
        console.error('Error checking push subscription:', error);
        toast({
          title: '오류',
          description: '푸시 알림 상태 확인에 실패했습니다.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    checkSubscription();
  }, [session?.user?.id, toast]);

  const urlBase64ToUint8Array = (base64String: string): ArrayBuffer => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer as ArrayBuffer;
  };

  const subscribe = async (): Promise<void> => {
    if (!publicVapidKey) {
      toast({
        title: '설정 오류',
        description: 'VAPID 공개 키가 설정되지 않았습니다.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        toast({
          title: '권한 거부',
          description: '알림 권한이 거부되었습니다. 브라우저 설정에서 허용해주세요.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription),
      });

      if (res.ok) {
        setIsEnabled(true);
        toast({
          title: '성공',
          description: '푸시 알림이 활성화되었습니다.',
        });
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || '구독에 실패했습니다.');
      }
    } catch (error) {
      console.error('Subscription failed:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '푸시 알림 활성화에 실패했습니다.',
        variant: 'destructive',
      });
      setIsEnabled(false);
    } finally {
      setIsLoading(false);
    }
  };

  const unsubscribe = async (): Promise<void> => {
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
      }

      const res = await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        setIsEnabled(false);
        toast({
          title: '성공',
          description: '푸시 알림이 비활성화되었습니다.',
        });
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || '구독 해제에 실패했습니다.');
      }
    } catch (error) {
      console.error('Unsubscription failed:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '푸시 알림 비활성화에 실패했습니다.',
        variant: 'destructive',
      });
      setIsEnabled(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (checked: boolean): Promise<void> => {
    if (checked) {
      await subscribe();
    } else {
      await unsubscribe();
    }
  };

  if (!isSupported) {
    return (
      <Alert>
        <BellOff className="h-4 w-4" />
        <AlertDescription>
          이 브라우저는 푸시 알림을 지원하지 않습니다.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isEnabled ? (
          <Bell className="h-5 w-5 text-primary" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <Label htmlFor="push-notifications" className="text-base font-medium">
            푸시 알림 활성화
          </Label>
          <p className="text-sm text-muted-foreground">
            {isEnabled
              ? '주문 체결, 전략 실행 알림을 받습니다.'
              : '알림을 받으려면 활성화하세요.'}
          </p>
        </div>
      </div>
      <Switch
        id="push-notifications"
        checked={isEnabled}
        onCheckedChange={handleToggle}
        disabled={isLoading || !session?.user?.id}
      />
    </div>
  );
}
