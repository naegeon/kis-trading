module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['./jest.setup.js'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(@auth|next-auth)/)',
  ],
  // Playwright 테스트 제외 (별도로 npx playwright test로 실행)
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/',  // Playwright 테스트 폴더
  ],
};
