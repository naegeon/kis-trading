'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
  appKey: z.string().min(1, '앱키를 입력해주세요'),
  appSecret: z.string().min(1, '앱시크릿을 입력해주세요'),
  accountNumber: z.string().min(10, '계좌번호를 입력해주세요 (예: 12345678-01)'),
  isMock: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function CredentialsForm() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      appKey: '',
      appSecret: '',
      accountNumber: '',
      isMock: true,
    },
  });

  const maskKey = (key: string): string => {
    if (!key || key.length < 8) return key;
    return `${key.substring(0, 4)}${'*'.repeat(key.length - 8)}${key.substring(key.length - 4)}`;
  };

  useEffect(() => {
    async function fetchCredentials(): Promise<void> {
      setIsLoading(true);
      try {
        const response = await fetch('/api/credentials');
        const data = await response.json();
        if (data.success && data.data) {
          setHasCredentials(true);
          setCredentialId(data.data.id);
          form.reset({
            appKey: data.data.appKey,
            appSecret: data.data.appSecret,
            accountNumber: data.data.accountNumber,
            isMock: data.data.isMock,
          });
        } else {
          setHasCredentials(false);
        }
      } catch (error) {
        console.error('Failed to fetch credentials:', error);
        toast({
          title: '오류',
          description: '기존 인증 정보를 불러오는데 실패했습니다.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    }
    fetchCredentials();
  }, [form, toast]);

  async function onSubmit(values: FormValues): Promise<void> {
    setIsLoading(true);
    try {
      const method = hasCredentials ? 'PATCH' : 'POST';
      const url = hasCredentials ? `/api/credentials/${credentialId}` : '/api/credentials';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || '인증 정보 저장에 실패했습니다');
      }

      setHasCredentials(true);
      setCredentialId(data.data.id || credentialId);
      setShowKeys(false);
      toast({
        title: '성공',
        description: 'KIS API 인증 정보가 저장되었습니다.',
      });
    } catch (error) {
      console.error('Failed to save credentials:', error);
      toast({
        title: '오류',
        description: error instanceof Error ? error.message : '인증 정보 저장에 실패했습니다.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }

  const handleToggleVisibility = (): void => {
    setShowKeys(!showKeys);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {hasCredentials && (
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm text-muted-foreground">API 키 보안 표시</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleToggleVisibility}
            >
              {showKeys ? (
                <>
                  <EyeOff className="h-4 w-4 mr-2" />
                  숨기기
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  보기
                </>
              )}
            </Button>
          </div>
        )}

        <FormField
          control={form.control}
          name="appKey"
          render={({ field }) => (
            <FormItem>
              <FormLabel>앱키 (App Key)</FormLabel>
              <FormControl>
                <Input
                  placeholder="한국투자증권 앱키를 입력하세요"
                  {...field}
                  value={hasCredentials && !showKeys ? maskKey(field.value) : field.value}
                  readOnly={hasCredentials && !showKeys}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="appSecret"
          render={({ field }) => (
            <FormItem>
              <FormLabel>앱시크릿 (App Secret)</FormLabel>
              <FormControl>
                <Input
                  placeholder="한국투자증권 앱시크릿을 입력하세요"
                  type={showKeys ? 'text' : 'password'}
                  {...field}
                  readOnly={hasCredentials && !showKeys}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>계좌번호</FormLabel>
              <FormControl>
                <Input
                  placeholder="계좌번호 10자리 입력 (예: 69718736-01)"
                  {...field}
                  maxLength={11}
                />
              </FormControl>
              <p className="text-sm text-muted-foreground mt-1">
                8자리 계좌번호 + 하이픈(-) + 상품코드 2자리를 입력하세요
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isMock"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <FormLabel className="text-base">모의투자 모드</FormLabel>
                <p className="text-sm text-muted-foreground">
                  {field.value ? '현재: 모의투자 계좌 사용 중' : '현재: 실전투자 계좌 사용 중'}
                </p>
                <FormMessage />
              </div>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  aria-label="모의투자 모드 활성화"
                />
              </FormControl>
            </FormItem>
          )}
        />

        {!form.watch('isMock') && (
          <Alert variant="destructive">
            <AlertDescription>
              실전투자 모드입니다. 실제 자금으로 거래가 실행됩니다. 신중하게 사용하세요.
            </AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={isLoading}>
          {isLoading ? '저장 중...' : hasCredentials ? '인증 정보 수정' : '인증 정보 저장'}
        </Button>
      </form>
    </Form>
  );
}
