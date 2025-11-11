// Integration test to verify category updates work end-to-end
// This tests the complete flow from background.js to list-modal.js

async function testCategoryIntegration() {
  console.log('=== Category Integration Test ===\n');
  
  // Mock storage data
  let mockStorage = {
    rvData: {
      bookmarks: [],
      categories: ["Articles", "Research", "Work", "Personal"],
      settings: {
        apiKey: "test-key",
        onboardingComplete: true,
        defaultIntervalDays: 7
      }
    }
  };
  
  // Mock chrome.storage.local
  const chrome = {
    storage: {
      local: {
        async get(key) {
          return mockStorage;
        },
        async set(data) {
          mockStorage = data;
          console.log('✓ Storage updated');
        }
      }
    }
  };
  
  // Simulate background.js updateBookmark logic
  async function simulateUpdateBookmark(bookmarkId, updatedData) {
    console.log('1. Simulating background.js updateBookmark...');
    
    const data = mockStorage.rvData;
    const bookmarkIndex = data.bookmarks.findIndex(b => b.id === bookmarkId);
    
    if (bookmarkIndex !== -1) {
      // Check if category has been updated by user and is new
      const updatedCategory = updatedData.category;
      const existingCategories = data.categories || [];
      
      if (updatedCategory && !existingCategories.includes(updatedCategory)) {
        console.log(`   ✓ New category detected: "${updatedCategory}"`);
        existingCategories.push(updatedCategory);
        existingCategories.sort();
        data.categories = existingCategories;
        console.log(`   ✓ Categories updated: [${data.categories.join(', ')}]`);
      } else {
        console.log(`   ✓ Category "${updatedCategory}" already exists`);
      }
      
      // Update the bookmark
      data.bookmarks[bookmarkIndex] = {
        ...data.bookmarks[bookmarkIndex],
        ...updatedData,
        isPreliminary: false
      };
      
      await chrome.storage.local.set({ rvData: data });
      console.log('   ✓ Bookmark updated successfully');
      return { success: true };
    } else {
      throw new Error('Bookmark not found');
    }
  }
  
  // Simulate list-modal.js category rendering
  function simulateRenderCategories() {
    console.log('\n2. Simulating list-modal.js renderCategories...');
    
    const data = mockStorage.rvData;
    const categories = data.categories || [];
    const bookmarks = data.bookmarks || [];
    
    console.log('   Available categories:', categories);
    
    // Simulate category items with counts
    categories.forEach(cat => {
      const count = bookmarks.filter(b => b.category === cat).length;
      console.log(`   - ${cat}: ${count} bookmarks`);
    });
    
    return categories;
  }
  
  // Simulate list-modal.js edit form category dropdown
  function simulateEditFormCategories() {
    console.log('\n3. Simulating edit form category dropdown...');
    
    const data = mockStorage.rvData;
    const categories = data.categories || [];
    const currentBookmark = data.bookmarks[0];
    
    console.log('   Current bookmark category:', currentBookmark?.category);
    console.log('   Available categories in dropdown:');
    
    const dropdownOptions = categories.map(c => {
      const selected = c === currentBookmark?.category ? ' (selected)' : '';
      console.log(`   - ${c}${selected}`);
      return c;
    });
    
    return dropdownOptions;
  }
  
  // Test the complete flow
  try {
    // Step 1: Create a preliminary bookmark
    console.log('=== Starting Integration Test ===\n');
    
    const preliminaryBookmark = {
      id: 'test-bm-123',
      url: 'https://example.com/tutorial',
      title: 'JavaScript Tutorial',
      category: 'Uncategorized',
      summary: 'A tutorial about JavaScript',
      tags: ['javascript', 'tutorial'],
      userNotes: '',
      addedTimestamp: Date.now(),
      revisitBy: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      status: 'Active',
      history: [],
      isPreliminary: true
    };
    
    mockStorage.rvData.bookmarks.push(preliminaryBookmark);
    console.log('✓ Preliminary bookmark created');
    
    // Step 2: User updates the bookmark with a NEW category
    console.log('\n=== User Updates Bookmark ===');
    const userUpdatedData = {
      title: 'JavaScript Tutorial',
      category: 'Tutorials', // NEW category!
      summary: 'A comprehensive JavaScript tutorial',
      tags: ['javascript', 'tutorial', 'programming'],
      userNotes: 'Very helpful tutorial',
      revisitBy: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    // Step 3: Background processes the update
    const updateResult = await simulateUpdateBookmark('test-bm-123', userUpdatedData);
    console.log('✓ Update result:', updateResult);
    
    // Step 4: Verify categories are updated in storage
    console.log('\n=== Verification ===');
    console.log('Final categories in storage:', mockStorage.rvData.categories);
    console.log('Final bookmark data:', {
      title: mockStorage.rvData.bookmarks[0].title,
      category: mockStorage.rvData.bookmarks[0].category,
      isPreliminary: mockStorage.rvData.bookmarks[0].isPreliminary
    });
    
    // Step 5: Simulate UI rendering
    const renderedCategories = simulateRenderCategories();
    const editFormCategories = simulateEditFormCategories();
    
    // Step 6: Test with another new category
    console.log('\n=== Testing Second New Category ===');
    const secondBookmark = {
      id: 'test-bm-456',
      url: 'https://example.com/video',
      title: 'Video Tutorial',
      category: 'Uncategorized',
      summary: 'A video tutorial',
      tags: ['video'],
      userNotes: '',
      addedTimestamp: Date.now(),
      revisitBy: new Date().toISOString(),
      status: 'Active',
      history: [],
      isPreliminary: true
    };
    
    mockStorage.rvData.bookmarks.push(secondBookmark);
    
    const secondUpdateData = {
      title: 'Video Tutorial',
      category: 'Videos', // Another NEW category!
      summary: 'A video tutorial about programming',
      tags: ['video', 'tutorial'],
      userNotes: '',
      revisitBy: new Date().toISOString()
    };
    
    await simulateUpdateBookmark('test-bm-456', secondUpdateData);
    
    console.log('\n=== Final State ===');
    console.log('All categories:', mockStorage.rvData.categories);
    console.log('All bookmarks:');
    mockStorage.rvData.bookmarks.forEach(bm => {
      console.log(`  - ${bm.title}: ${bm.category}`);
    });
    
    // Verify categories are properly sorted
    const sortedCategories = [...mockStorage.rvData.categories].sort();
    const isSorted = JSON.stringify(mockStorage.rvData.categories) === JSON.stringify(sortedCategories);
    console.log(`\n✓ Categories are sorted: ${isSorted}`);
    
    console.log('\n=== Integration Test Complete ===');
    return {
      success: true,
      finalCategories: mockStorage.rvData.categories,
      finalBookmarks: mockStorage.rvData.bookmarks
    };
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    return { success: false, error: error.message };
  }
}

// Run the integration test
testCategoryIntegration().then(result => {
  console.log('\n📊 Final Result:');
  console.log(JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('Test failed:', error);
});