// Test script to verify category update functionality
// This simulates the flow of adding a bookmark with a new category

async function testCategoryUpdate() {
  console.log('=== Testing Category Update Functionality ===\n');
  
  // Mock chrome.storage.local
  const mockStorage = {
    data: {
      bookmarks: [],
      categories: ["Articles", "Research", "Work", "Personal"],
      settings: {
        apiKey: "test-key",
        onboardingComplete: true
      }
    },
    
    async get(key) {
      return { rvData: this.data };
    },
    
    async set(data) {
      this.data = data.rvData;
      console.log('✓ Storage updated with new data');
    }
  };
  
  // Mock chrome.runtime.sendMessage for content script
  const mockSendMessage = async (message) => {
    console.log('Message sent:', message.action);
    return { success: true };
  };
  
  // Test 1: Initial state
  console.log('1. Initial categories:', mockStorage.data.categories);
  
  // Test 2: Simulate user adding bookmark with existing category
  console.log('\n2. Testing with existing category...');
  const existingCategoryData = {
    title: "Test Article",
    category: "Articles", // Existing category
    summary: "Test summary",
    tags: ["test"],
    userNotes: "",
    revisitBy: new Date().toISOString()
  };
  
  // Simulate the updateBookmark logic
  const data = mockStorage.data;
  const updatedCategory = existingCategoryData.category;
  const existingCategories = data.categories || [];
  
  if (updatedCategory && !existingCategories.includes(updatedCategory)) {
    console.log('   → Would add new category (THIS SHOULD NOT HAPPEN)');
    existingCategories.push(updatedCategory);
    existingCategories.sort();
    data.categories = existingCategories;
  } else {
    console.log('   ✓ Category already exists, no update needed');
  }
  
  // Test 3: Simulate user adding bookmark with NEW category
  console.log('\n3. Testing with NEW category...');
  const newCategoryData = {
    title: "Test Tutorial",
    category: "Tutorials", // NEW category
    summary: "Test summary",
    tags: ["test", "tutorial"],
    userNotes: "",
    revisitBy: new Date().toISOString()
  };
  
  const newCategory = newCategoryData.category;
  
  if (newCategory && !data.categories.includes(newCategory)) {
    console.log('   ✓ New category detected:', newCategory);
    data.categories.push(newCategory);
    data.categories.sort();
    console.log('   ✓ Categories updated and sorted');
  } else {
    console.log('   → Category already exists (THIS SHOULD NOT HAPPEN)');
  }
  
  // Test 4: Verify final state
  console.log('\n4. Final categories:', data.categories);
  console.log('   ✓ New category "Tutorials" should be in the list');
  
  // Test 5: Verify bookmark was updated
  console.log('\n5. Simulating bookmark update...');
  const bookmarkId = 'test-id-123';
  const bookmarkIndex = data.bookmarks.findIndex(b => b.id === bookmarkId);
  
  // Add preliminary bookmark first
  data.bookmarks.push({
    id: bookmarkId,
    url: 'https://example.com',
    title: 'Test Tutorial',
    category: 'Uncategorized',
    summary: '',
    tags: [],
    userNotes: '',
    addedTimestamp: Date.now(),
    revisitBy: new Date().toISOString(),
    status: 'Active',
    history: [],
    isPreliminary: true
  });
  
  // Now update it with new data
  const bookmarkIndexAfterAdd = data.bookmarks.findIndex(b => b.id === bookmarkId);
  if (bookmarkIndexAfterAdd !== -1) {
    data.bookmarks[bookmarkIndexAfterAdd] = {
      ...data.bookmarks[bookmarkIndexAfterAdd],
      ...newCategoryData,
      isPreliminary: false
    };
    console.log('   ✓ Bookmark updated with new category');
    console.log('   ✓ Bookmark isPreliminary flag removed');
  }
  
  console.log('\n6. Final verification:');
  console.log('   Categories:', data.categories);
  console.log('   Bookmark category:', data.bookmarks[0].category);
  console.log('   Categories include bookmark category:', data.categories.includes(data.bookmarks[0].category));
  
  console.log('\n=== Test Complete ===');
  return data;
}

// Run the test
testCategoryUpdate().then(result => {
  console.log('\nTest result:', JSON.stringify(result, null, 2));
}).catch(error => {
  console.error('Test failed:', error);
});