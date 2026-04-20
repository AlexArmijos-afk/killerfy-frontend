import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReproductorPage } from './reproductor.page';

describe('ReproductorPage', () => {
  let component: ReproductorPage;
  let fixture: ComponentFixture<ReproductorPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(ReproductorPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
