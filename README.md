# EasyDB
Small framework that binds data between server and several clients

## Installation
### Start server
1. Install NodeJS
2. Run bash commands
```bash
git clone https://github.com/AntonBorzenko/EasyDB
npm install
npm run start-serv
```

### Include script on your page
```html
<script src="dist/bundle.js"></script>
```

## Using database
### Initializing DB connection
```javascript
let edb = new EasyDb('http://server-site-or-ip/easy-db');
```

### Replacing data
```javascript
edb.data = {
    /* some data */
};
```

### Updating data
```javascript
let data = edb.data;
data.hello = 'World';
```

The database synces every 1 second by default.

## Using model
### After initialising connection
```javascript
let object = new EasyDbModel();
object.a = 1;
object.b = '2';
object.save();
```

### Getting id after saving
```javascript
object.id;
```

### Getting all objects
```javascript
EasyDbModel.getAll(); // returns array of all EasyDbModel object
```

### Searching objects
```javascript
EasyDbModel.find(obj => obj.a === 1); // returns one EasyDbModel object
EasyDbModel.findAll(obj => obj.a === 1); // returns all EasyDbModel object
```

### Using custom model collection
```javascript
class CarModel extends EasyDbModel {
    
}
```
### or
```javascript
let CarModel = EasyDbModel.getModel('CarModel');
```

All models modificate edb.data.m object.
