/**
 * @typedef {Object} FoodItem
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {number} pricePaise
 * @property {string} image
 * @property {string} imageAlt
 * @property {boolean} available
 *
 * @typedef {{ item: FoodItem, quantity: number }} CartItem
 */

// Demo data for Phase 3. Integer paise keep cart arithmetic exact. 4500 paise = ₹45.
/** @type {FoodItem[]} */
export const foodItems = [
  {
    id: 'veg-sandwich',
    name: 'Veg Sandwich',
    description: 'Toasted bread, crunchy vegetables, and a little green chutney.',
    category: 'Breakfast',
    pricePaise: 4500,
    image: 'images/menu/veg-sandwich.jpg',
    imageAlt: 'A toasted vegetable sandwich served with fries and dips.',
    available: true,
  },
  {
    id: 'masala-dosa',
    name: 'Masala Dosa',
    description: 'A golden, crisp dosa with potato masala, sambar, and chutney.',
    category: 'Breakfast',
    pricePaise: 6000,
    image: 'images/menu/masala-dosa.jpg',
    imageAlt: 'Masala dosa on a white plate with sambar and coconut chutney.',
    available: true,
  },
  {
    id: 'veg-burger',
    name: 'Veg Burger',
    description: 'A crispy vegetable patty with fresh lettuce in a soft bun.',
    category: 'Snacks',
    pricePaise: 6500,
    image: 'images/menu/veg-burger.jpg',
    imageAlt: 'A vegetable patty burger with lettuce, onion, and fries.',
    available: false,
  },
  {
    id: 'samosa',
    name: 'Samosa',
    description: 'Flaky pastry filled with spiced potatoes. A classic break-time bite.',
    category: 'Snacks',
    pricePaise: 2000,
    image: 'images/menu/samosa.jpg',
    imageAlt: 'A golden triangular samosa on a blue ceramic plate.',
    available: true,
  },
  {
    id: 'paneer-rice-bowl',
    name: 'Paneer Rice Bowl',
    description: 'Soft paneer in a comforting curry, paired with a serving of rice.',
    category: 'Meals',
    pricePaise: 9000,
    image: 'images/menu/paneer-rice.jpg',
    imageAlt: 'An illustrative paneer curry and rice meal with side dishes.',
    available: true,
  },
  {
    id: 'cold-coffee',
    name: 'Cold Coffee',
    description: 'Smooth, chilled coffee with milk and a swirl of chocolate.',
    category: 'Beverages',
    pricePaise: 5000,
    image: 'images/menu/cold-coffee.jpg',
    imageAlt: 'Chilled milk coffee in a glass with chocolate sauce.',
    available: true,
  },
  {
    id: 'fresh-lime-soda',
    name: 'Fresh Lime Soda',
    description: 'A refreshing citrus cooler with lime, mint, and a little fizz.',
    category: 'Beverages',
    pricePaise: 3500,
    image: 'images/menu/lime-soda.jpg',
    imageAlt: 'An illustrative iced citrus drink with mint and lemon slices.',
    available: true,
  },
  {
    id: 'gulab-jamun',
    name: 'Gulab Jamun',
    description: 'Two soft, syrup-soaked sweets for a happy finish to your meal.',
    category: 'Desserts',
    pricePaise: 3000,
    image: 'images/menu/gulab-jamun.jpg',
    imageAlt: 'Gulab jamun served in a small dessert bowl.',
    available: true,
  },
]

// Category buttons stay in sync when demo dishes are added or edited.
export const categories = ['All', ...new Set(foodItems.map((item) => item.category))]
