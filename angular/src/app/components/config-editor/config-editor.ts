import { Component, inject } from '@angular/core';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { ConfstackService } from '../../services/confstack.service';

@Component({
  selector: 'app-config-editor',
  standalone: true,
  imports: [
    MatExpansionModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, MatCheckboxModule, MatButtonModule, FormsModule,
  ],
  templateUrl: './config-editor.html',
  styleUrl: './config-editor.scss',
})
export class ConfigEditorComponent {
  private conf = inject(ConfstackService);

  /** Instrument presets for quick selection */
  instruments = [
    '37-strings-g-g',
    '25-strings-g-g',
    '25-strings-G-g-Bass',
    '21-strings-a-f',
    '18-strings-b-e',
    'saitenspiel',
  ];

  /** Get a config value by key */
  getConf(key: string): any {
    return this.conf.get(key);
  }

  /** Set a config value */
  setConf(key: string, value: any): void {
    this.conf.set(key, value);
  }

  /** Apply an instrument preset */
  applyInstrument(name: string): void {
    const preset = this.conf.get(`presets.instrument.${name}`);
    if (preset) {
      if (preset.layout) {
        this.conf.push({ extract: { 0: { layout: preset.layout } } });
      }
      if (preset.stringnames) {
        this.conf.push({ extract: { 0: { stringnames: preset.stringnames } } });
      }
      if (preset.printer) {
        this.conf.push({ extract: { 0: { printer: preset.printer } } });
      }
    }
  }
}
