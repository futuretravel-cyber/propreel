export const checkIsAdmin = (user) => {
  if (!user || !user.email) return false;
  return user.email.toLowerCase() === 'futuretravel@gmail.com';
};