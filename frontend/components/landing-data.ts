// Static explanatory copy; live listing data comes from the backend.
export const steps = [
  { title: 'Create Your Profile', body: 'Specify your rent budget, preferred Lagos/Abuja/PH locations, and daily habits (smoking, working hours, hosting policy).' },
  { title: 'Browse Real Matches', body: 'Browse roommates and open rooms by location, budget, and lifestyle to find people who share your living preferences.' },
  { title: 'Connect & Move In', body: 'Use in-app chat to get to know each other, arrange a viewing, and discuss your living arrangements before moving in.' },
];

export const communities = [
  { slot: 'students', label: 'Campus Splitters', title: 'Students', body: 'University and polytechnic students looking to split off-campus rent near UNILAG, UI, UNN, and more.' },
  { slot: 'professionals', label: 'Working Adults', title: 'Young Professionals', body: 'Corporate climbers seeking affordable flatshares close to commercial zones like Lekki, Victoria Island, or Central Business Districts.' },
  { slot: 'relocators', label: 'City Newcomers', title: 'Relocators', body: 'People transitioning to a completely new Nigerian city who need a roommate and an easy soft-landing arrangement.' },
];

export const plans = [
  { name: 'Seekers', description: 'Perfect for finding roommates and shared apartments', price: 'NGN0/month', premium: false, role: 'seeker', action: 'Get Started Free', features: ['Create Profile', 'Browse roommate profiles', 'Browse shared apartments', 'Save listings', 'Send messages', 'Receive recommendations'] },
  { name: 'Premium Seekers', description: 'For users who want more ways to find a match', price: 'NGN5,000/month', premium: true, role: 'seeker', action: 'Coming soon', features: ['Unlimited messaging', 'Advanced room filters', 'Compatibility score', 'Priority profile visibility', 'Early access to new listings'] },
  { name: 'Listers', description: 'Best for individual landlords', price: 'NGN0/month', premium: false, role: 'lister', action: 'Start Listing', features: ['Create account', 'Publish listings', 'Receive inquiries', 'Manage messages'] },
  { name: 'Premium Listers', description: 'For active landlords and property managers', price: 'NGN10,000/month', premium: true, role: 'lister', action: 'Coming soon', features: ['More active listings', 'Featured placements', 'Listing analytics', 'Priority support', 'Increased visibility'] },
];

export const faqs = [
  { question: 'How do you help me find a roommate who actually matches how I live?', answer: 'Add your budget, preferred location, and lifestyle habits to your profile. Browse with these preferences and compare profiles, then chat to find out whether you would be comfortable sharing a home.' },
  { question: 'Do I need a subscription to find roommates?', answer: 'You can create a seeker account, browse profiles, save listings, and message people without a paid subscription. Premium plans are not available yet.' },
  { question: 'Is Roommate Finder free?', answer: 'The basic seeker and lister accounts are free. Premium plans shown here are planned offerings and cannot currently be purchased.' },
  { question: 'Can I list a room or shared apartment?', answer: 'Choose the Property Lister role when creating your account. After confirming your email and setting up your profile, you can publish a listing with its location, rent, amenities, and photos.' },
  { question: 'How can I stay safe when meeting a potential roommate?', answer: 'Start with in-app messages, review their profile, and arrange a viewing before making a commitment. Never send money or share sensitive information before verifying the person and the property. You can report or block users from their conversation profile.' },
];
