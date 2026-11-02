import vinext from 'vinext';
import { defineConfig } from 'vite';
export default defineConfig({server:{host:'127.0.0.1',port:3003,strictPort:true},ssr:{external:['mysql2','mysql2/promise']},plugins:[vinext()]});
