import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'password123',
  };

  test('should allow a user to sign up, log in, and log out', async ({ page }) => {
    // 1. Sign Up
    await page.goto('/signup');
    await expect(page).toHaveTitle(/Sign Up/);

    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').fill(testUser.password);
    await page.getByRole('button', { name: 'Sign Up' }).click();

    // Should be redirected to the login page after successful sign up
    await expect(page).toHaveURL(/.*login/);
    await expect(page.getByText('Sign up successful! Please log in.')).toBeVisible();

    // 2. Log In
    await page.getByLabel('Email').fill(testUser.email);
    await page.getByLabel('Password').fill(testUser.password);
    await page.getByRole('button', { name: 'Login' }).click();

    // Should be redirected to the strategies page after successful login
    await expect(page).toHaveURL(/.*\/strategies/);
    await expect(page.getByRole('heading', { name: 'Strategies' })).toBeVisible();

    // 3. Log Out
    // Note: The selector for the sign-out button might need adjustment
    // depending on the actual implementation (e.g., if it's in a dropdown).
    // This assumes a visible "Sign Out" button is on the page.
    const signOutButton = page.getByRole('button', { name: 'Sign Out' });
    await signOutButton.click();

    // Should be redirected to the login page after logging out
    await expect(page).toHaveURL(/.*\/login/);
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });
});
