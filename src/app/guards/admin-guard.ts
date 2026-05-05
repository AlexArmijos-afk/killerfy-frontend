import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const esAdmin = auth.esAdmin();
  console.log('adminGuard — esAdmin:', esAdmin);  // ← log
  console.log('adminGuard — roles:', auth.obtenerRolesDelToken()); // ← log

  if (esAdmin) {
    return true;
  }

  router.navigateByUrl('/tabs/inicio', { replaceUrl: true });
  return false;
};