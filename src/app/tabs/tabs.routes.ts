import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'tabs',
    component: TabsPage,
    children: [
      {
        path: 'inicio',
        loadComponent: () => import('../pages/inicio/inicio.page').then(m => m.InicioPage),
      },
      {
        path: 'buscar',
        loadComponent: () => import('../pages/buscar/buscar.page').then(m => m.BuscarPage),
      },
      {
        path: 'perfil',
        loadComponent: () => import('../pages/perfil/perfil.page').then(m => m.PerfilPage),
      },
      {
        path: '',
        redirectTo: '/tabs/inicio',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '',
    redirectTo: '/tabs/inicio',
    pathMatch: 'full',
  },
];