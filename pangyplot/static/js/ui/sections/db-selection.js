document.addEventListener('DOMContentLoaded', function () {
    fetchDbOptions();
    
    document.getElementById('db-selection').addEventListener('change', function() {
        fetchData("/dbset?db="+this.value, 'Fetching dropdown options')
        .then(data => {});
    });
});

function fetchDbOptions() {
    fetchData('/dboptions', 'Fetching dropdown options')
        .then(data => {
            const select = document.getElementById('db-selection');
            select.innerHTML = '';
            data.forEach(option => {
                let opt = document.createElement('option');
                opt.value = option;
                opt.innerHTML = option;
                select.appendChild(opt);
            });
        });

}

