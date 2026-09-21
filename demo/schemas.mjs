// Three destination tables, for the demo only. Your product has one schema:
// its own. This file is the shape to copy, not the content.
//
// The `desc` of every column is the part that earns its keep. It is what the
// model reads to tell two neighbouring fields apart, and it is why
// `work_email` wins over `personal_email` on a file that offers both. Write
// them as a sentence about what the column holds, and say what it does NOT
// hold when a near miss exists.
export const SCHEMAS = {
  crm_contacts: {
    id: 'crm_contacts',
    name: 'CRM contacts',
    about: 'People in a sales CRM, one row per contact.',
    samples: ['crm-hubspot-export.csv', 'crm-eventbrite.csv', 'crm-french-crm.csv'],
    columns: [
      { key: 'first_name', type: 'text', desc: 'Given name only, not the full name' },
      { key: 'last_name', type: 'text', desc: 'Family name only, not the full name' },
      { key: 'email', type: 'email', desc: 'Primary business email address for the contact' },
      { key: 'phone', type: 'phone', desc: 'Phone number, any format' },
      { key: 'company', type: 'text', desc: 'Name of the organisation the contact works for' },
      { key: 'job_title', type: 'text', desc: 'Role or position held inside that organisation' },
      { key: 'city', type: 'text', desc: 'City the contact is based in' },
      { key: 'country', type: 'text', desc: 'Country the contact is based in' },
      { key: 'lifecycle_stage', type: 'enum', desc: 'Where the contact sits in the funnel: lead, opportunity, customer, other' },
      { key: 'owner', type: 'text', desc: 'Internal salesperson who owns this contact' },
    ],
  },
  ecom_orders: {
    id: 'ecom_orders',
    name: 'E-commerce orders',
    about: 'One row per order line: an order reference, a product, a quantity, a price.',
    samples: ['orders-shopify.csv', 'orders-minimal.csv', 'orders-warehouse-export.csv'],
    columns: [
      { key: 'order_ref', type: 'text', desc: 'The order number or reference, not a person and not a product code' },
      { key: 'ordered_at', type: 'datetime', desc: 'When the order was placed' },
      { key: 'customer_email', type: 'email', desc: 'Email of the person who placed the order' },
      { key: 'sku', type: 'text', desc: 'Product code or SKU identifying the article' },
      { key: 'product_name', type: 'text', desc: 'Human-readable product name' },
      { key: 'quantity', type: 'integer', desc: 'How many units of the article were ordered' },
      { key: 'unit_price', type: 'money', desc: 'Price of one unit, before tax and discount, not the order total' },
      { key: 'currency', type: 'enum', desc: 'Three-letter currency code' },
      { key: 'status', type: 'enum', desc: 'Fulfilment or dispatch state of the order' },
      { key: 'ship_country', type: 'text', desc: 'Country the order is shipped to' },
    ],
  },
  hr_employees: {
    id: 'hr_employees',
    name: 'HR employees',
    about: 'The people directory, one row per employee.',
    samples: ['hr-bamboo.csv', 'hr-payroll.csv', 'hr-identity-provider.csv'],
    columns: [
      { key: 'employee_id', type: 'text', desc: 'Internal identifier for the employee' },
      { key: 'full_name', type: 'text', desc: 'Full name, given and family together' },
      { key: 'work_email', type: 'email', desc: 'Company email address, explicitly not a personal one' },
      { key: 'department', type: 'text', desc: 'Team or department the employee belongs to' },
      { key: 'manager_email', type: 'email', desc: 'Email of the person this employee reports to' },
      { key: 'hire_date', type: 'date', desc: 'Date the employee started' },
      { key: 'employment_type', type: 'enum', desc: 'Permanent, fixed-term, part-time and so on' },
      { key: 'annual_salary', type: 'money', desc: 'Yearly gross compensation' },
      { key: 'location', type: 'text', desc: 'Office or place of work' },
      { key: 'active', type: 'boolean', desc: 'Whether the employee is currently employed' },
    ],
  },
};
