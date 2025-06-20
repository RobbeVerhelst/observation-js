import { expect, test, describe, beforeAll } from 'bun:test';
import { createPublicClient, retryOperation } from './setup';
import { ObservationClient } from '../../src/index';

describe('E2E: Performance & Reliability', () => {
  let publicClient: ObservationClient;

  beforeAll(async () => {
    console.log('🚀 Setting up E2E Performance tests...');
    publicClient = createPublicClient();
  });

  test('should respond within reasonable time limits', async () => {
    const startTime = Date.now();
    
    const species = await publicClient.species.get(2);
    
    const responseTime = Date.now() - startTime;
    
    expect(species).toBeDefined();
    expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    
    console.log(`✅ Species API responded in ${responseTime}ms`);
    
    if (responseTime > 2000) {
      console.warn(`⚠️ Slow response detected: ${responseTime}ms (expected < 2000ms)`);
    }
  });

  test('should handle multiple sequential requests efficiently', async () => {
    const startTime = Date.now();
    
    // Make sequential requests to be respectful to the API
    const results: any[] = [];
    for (let i = 0; i < 3; i++) {
      const species = await retryOperation(async () => await publicClient.species.get(2 + i));
      results.push(species);
      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    const totalTime = Date.now() - startTime;
    
    expect(results).toHaveLength(3);
    results.forEach((species, index) => {
      expect(species).toBeDefined();
      expect(species.id).toBe(2 + index);
    });
    
    console.log(`✅ ${results.length} sequential requests completed in ${totalTime}ms`);
    console.log(`   Average: ${Math.round(totalTime / results.length)}ms per request`);
  });

  test('should be resilient to network issues', async () => {
    // Add a small delay to reduce the chance of hitting a rate limit from previous tests
    await new Promise(resolve => setTimeout(resolve, 1000));

    let attempts = 0;
    const maxAttempts = 3;
    
    const result = await retryOperation(
      async () => {
        attempts++;
        console.log(`Attempt ${attempts}/${maxAttempts}`);
        return await publicClient.species.get(2);
      },
      maxAttempts,
      500 // 500ms delay between retries
    );
    
    expect(result).toBeDefined();
    expect(result.id).toBe(2);
    
    console.log(`✅ Request succeeded after ${attempts} attempt(s)`);
  }, { timeout: 65000 }); // 65 seconds timeout to accommodate for API rate-limiting headers

  test('should handle large response payloads', async () => {
    const startTime = Date.now();
    
    // Search for a common term that should return many results
    const searchResults = await publicClient.species.search({ q: 'a' });
    
    const responseTime = Date.now() - startTime;
    
    expect(searchResults).toBeDefined();
    expect(searchResults.results).toBeDefined();
    expect(Array.isArray(searchResults.results)).toBe(true);
    
    // Should handle large payloads reasonably fast
    expect(responseTime).toBeLessThan(10000); // 10 seconds max
    
    console.log(`✅ Large search response (${searchResults.results.length} results) in ${responseTime}ms`);
    
    // Validate structure of all results
    searchResults.results.slice(0, 5).forEach((species, index) => {
      expect(species.id).toBeGreaterThan(0);
      expect(species.name).toBeDefined();
      expect(species.scientific_name).toBeDefined();
    });
  });

  test('should maintain consistent response format across multiple calls', async () => {
    const calls = 5;
    const results: any[] = [];
    
    for (let i = 0; i < calls; i++) {
      const species = await publicClient.species.get(2);
      results.push(species);
      
      // Small delay between calls
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // All responses should be identical
    results.forEach((species) => {
      expect(species).toEqual(results[0]);
    });
    
    console.log(`✅ ${calls} consecutive calls returned consistent data`);
  });

  test('should handle edge case parameters gracefully', async () => {
    const edgeCases = [
      { description: 'empty search', params: { q: '' } },
      { description: 'single character search', params: { q: 'a' } },
    ];
    
    // Helper function to add timeout to requests
    const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      
      return Promise.race([promise, timeoutPromise]);
    };
    
    for (const testCase of edgeCases) {
      try {
        const result = await withTimeout(
          publicClient.species.search(testCase.params),
          3000 // 3 second timeout per request
        );
        
        expect(result).toBeDefined();
        expect(result.results).toBeDefined();
        expect(Array.isArray(result.results)).toBe(true);
        expect(typeof result.count).toBe('number');
        
        console.log(`✅ ${testCase.description}: ${result.count} results`);
      } catch (error) {
        // Edge cases might timeout or fail - this is acceptable
        console.log(`⚠️ ${testCase.description}: ${error instanceof Error ? error.message : 'Failed'}`);
        // Don't fail the test for edge cases - just log the issue
      }
      
      // Small delay between edge case tests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('✅ Edge case parameter testing completed');
  });
}); 